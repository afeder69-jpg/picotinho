import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Iniciando processamento de DANFE PDF...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      throw new Error('Variáveis de ambiente não configuradas');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { pdfUrl, notaImagemId, userId } = await req.json();

    if (!pdfUrl || !notaImagemId || !userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Parâmetros obrigatórios: pdfUrl, notaImagemId, userId'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log("📥 Baixando PDF:", pdfUrl);
    const resp = await fetch(pdfUrl);
    if (!resp.ok) throw new Error(`Falha ao baixar PDF: ${resp.status}`);
    const buffer = await resp.arrayBuffer();

    // 📄 Decodificar PDF em texto bruto
    let pdfString = new TextDecoder("latin1").decode(new Uint8Array(buffer));

    // 📝 Extrair apenas trechos de texto entre parênteses
    const regex = /\(([^)]+)\)/g;
    let extractedText = "";
    let match;
    while ((match = regex.exec(pdfString)) !== null) {
      extractedText += match[1] + " ";
    }

    // 🔍 LOG COMPLETO DO TEXTO EXTRAÍDO
    console.log("=".repeat(80));
    console.log("📝 TEXTO BRUTO EXTRAÍDO DO PDF:");
    console.log("=".repeat(80));
    console.log(extractedText);
    console.log("=".repeat(80));
    console.log(`📊 Total de caracteres extraídos: ${extractedText.length}`);
    console.log("=".repeat(80));

    // Sempre salvar o texto bruto, mesmo se a validação falhar
    try {
      await supabase
        .from('notas_imagens')
        .update({
          dados_extraidos: {
            textoBruto: extractedText,
            timestamp: new Date().toISOString(),
            tamanho_texto: extractedText.length
          }
        })
        .eq('id', notaImagemId);
    } catch (saveError) {
      console.error('Erro ao salvar texto bruto:', saveError);
    }

    if (!extractedText || extractedText.length < 50) {
      return new Response(JSON.stringify({
        success: false,
        error: "INSUFFICIENT_TEXT",
        message: "PDF não contém texto suficiente — provavelmente é PDF escaneado",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 📝 PRÉ-PROCESSAMENTO: Dividir texto em linhas
    const linhasTexto = extractedText.split(/\n|\s{2,}/).filter(linha => linha.trim().length > 0);
    console.log(`📋 Texto dividido em ${linhasTexto.length} linhas`);
    
    const textoProcessado = linhasTexto.join('\n');

    console.log('🤖 Processando texto com GPT...');
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Você é especialista em processar DANFE NFC-e (nota fiscal eletrônica do consumidor).
IMPORTANTE:
- Sempre responda com JSON válido no formato abaixo.
- Extraia **todos os produtos listados** no cupom, cada um como um objeto no array "itens".
- Percorra linha por linha do texto fornecido para encontrar todos os produtos.
- Não resuma e não ignore linhas de produto - capture TODOS os itens.
- Mesmo que algum campo esteja incompleto, preencha o que conseguir (ex.: descricao e preco_total).
- Se não encontrar unidade, use "UN".
- Se não encontrar quantidade, use 1.
- Procure por padrões como: nome do produto + quantidade + preço unitário + preço total.

Formato de resposta:
{
  "estabelecimento": { "nome_fantasia": "string", "cnpj": "string", "endereco": "string" },
  "compra": { "data_compra": "YYYY-MM-DD", "hora_compra": "HH:MM:SS", "valor_total": number, "numero_nota": "string" },
  "itens": [
    { "descricao": "string", "quantidade": number, "unidade": "string", "preco_unitario": number, "preco_total": number }
  ]
}`
          },
          {
            role: 'user',
            content: `Extraia os dados desta nota fiscal processando linha por linha para capturar todos os produtos:

${textoProcessado}`
          }
        ],
        max_tokens: 4000
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`OpenAI API erro: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    
    // 🔍 LOG COMPLETO DA RESPOSTA DA IA
    console.log("=".repeat(80));
    console.log("🤖 RESPOSTA BRUTA DA IA:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(aiResult, null, 2));
    console.log("=".repeat(80));

    const aiContent = aiResult.choices[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('IA não retornou resposta válida');
    }

    console.log('🎯 Conteúdo JSON da resposta da IA:');
    console.log("=".repeat(80));
    console.log(aiContent);
    console.log("=".repeat(80));

    let dadosExtraidos;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON não encontrado na resposta da IA');
      }
      dadosExtraidos = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('❌ Erro ao fazer parse do JSON da IA:', parseError);
      // Salvar dados de debug mesmo com erro
      await supabase
        .from('notas_imagens')
        .update({
          processada: false,
          dados_extraidos: {
            erro_parse: true,
            texto_extraido: extractedText,
            resposta_ia_bruta: aiContent,
            erro_detalhes: parseError.message
          }
        })
        .eq('id', notaImagemId);

      return new Response(JSON.stringify({
        success: false,
        error: 'JSON_PARSE_ERROR',
        message: 'Erro ao processar resposta da IA',
        debug: {
          texto_extraido_length: extractedText.length,
          resposta_ia: aiContent
        }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Validação menos rígida - aceitar mesmo sem itens para debug
    const itensExtraidos = dadosExtraidos.itens || [];
    console.log(`📦 Itens extraídos: ${itensExtraidos.length}`);

    // Sempre salvar dados de debug
    const dadosCompletos = {
      ...dadosExtraidos,
      debug_info: {
        texto_extraido_length: extractedText.length,
        texto_extraido: extractedText.slice(0, 1000), // Primeiros 1000 chars para debug
        resposta_ia_completa: aiContent,
        processamento_timestamp: new Date().toISOString()
      }
    };

    // Atualizar nota como processada (mesmo sem itens)
    await supabase
      .from('notas_imagens')
      .update({
        processada: true,
        dados_extraidos: dadosCompletos
      })
      .eq('id', notaImagemId);

    console.log(`✅ Processamento concluído! ${itensExtraidos.length} itens extraídos`);

    return new Response(JSON.stringify({
      success: true,
      message: `DANFE processada - ${itensExtraidos.length} itens extraídos`,
      itens_extraidos: itensExtraidos.length,
      dados: dadosExtraidos,
      debug: {
        texto_length: extractedText.length,
        ai_response_length: aiContent.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro no processamento:', error);
    return new Response(JSON.stringify({
      success: false,
      error: "GENERAL_ERROR",
      message: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});