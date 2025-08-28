import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Iniciando processamento de PDF...');
    
    // Validar variáveis de ambiente
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      throw new Error('Variáveis de ambiente não configuradas corretamente');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Validar body da requisição
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_JSON',
        message: 'Corpo da requisição não é um JSON válido',
        details: parseError.message
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { notaImagemId, pdfUrl, userId } = requestBody;

    if (!notaImagemId || !pdfUrl || !userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Parâmetros obrigatórios ausentes: notaImagemId, pdfUrl, userId'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Parâmetros validados:', { notaImagemId, pdfUrl, userId });

    // 📥 Baixar o PDF com timeout
    console.log('📥 Baixando PDF...');
    let pdfBuffer;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
      
      const pdfResponse = await fetch(pdfUrl, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!pdfResponse.ok) {
        throw new Error(`HTTP ${pdfResponse.status}: ${pdfResponse.statusText}`);
      }

      pdfBuffer = await pdfResponse.arrayBuffer();
      console.log('✅ PDF baixado com sucesso, tamanho:', pdfBuffer.byteLength);
      
      if (pdfBuffer.byteLength === 0) {
        throw new Error('PDF está vazio');
      }
    } catch (downloadError) {
      console.error('❌ Erro ao baixar PDF:', downloadError);
      return new Response(JSON.stringify({
        success: false,
        error: 'DOWNLOAD_FAILED',
        message: 'Falha ao baixar o PDF',
        details: downloadError.message
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 📄 Extrair texto do PDF usando método simples
    console.log('📄 Extraindo texto do PDF...');
    let extractedText = '';
    
    try {
      extractedText = await extractTextFromPDF(pdfBuffer);
      console.log(`✅ Extração concluída. Texto extraído: ${extractedText.length} caracteres`);
    } catch (extractError) {
      console.error('❌ Erro na extração de texto:', extractError);
      return new Response(JSON.stringify({
        success: false,
        error: 'TEXT_EXTRACTION_FAILED',
        message: 'Falha na extração de texto do PDF',
        details: extractError.message,
        requiredOCR: true
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!extractedText || extractedText.length < 50) {
      console.log('⚠️ Texto extraído insuficiente:', extractedText);
      return new Response(JSON.stringify({
        success: false,
        error: 'INSUFFICIENT_TEXT',
        message: 'PDF não contém texto suficiente - provavelmente é PDF escaneado',
        textoExtraido: extractedText,
        requiredOCR: true
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // LOG COMPLETO DO TEXTO EXTRAÍDO
    console.log('📝 TEXTO BRUTO EXTRAÍDO DO PDF:');
    console.log('='.repeat(80));
    console.log(extractedText);
    console.log('='.repeat(80));

    // 🤖 Processar com IA
    console.log('🤖 Enviando texto para IA processar...');
    let aiResult;
    try {
      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-2025-08-07',
          messages: [
            {
              role: 'system',
              content: `Você é um especialista em processar notas fiscais brasileiras (DANFE NFC-e).

IMPORTANTE: Extraia EXATAMENTE as informações como aparecem no texto. Ignore texto corrupto ou códigos de formatação PDF.

Analise este texto de uma nota fiscal brasileira (DANFE NFC-e) e extraia:

1. DADOS DO ESTABELECIMENTO:
- nome_fantasia (nome do supermercado/loja)
- cnpj (formato: XX.XXX.XXX/XXXX-XX)
- endereco (endereço completo)

2. DADOS DA COMPRA:
- data_compra (formato: YYYY-MM-DD)
- hora_compra (formato: HH:MM:SS)
- valor_total (valor total da compra em número)
- numero_nota (número da nota fiscal)

3. PRODUTOS/ITENS (array):
Para cada item, extraia:
- descricao (nome exato do produto como aparece)
- quantidade (quantidade comprada em número)
- unidade (UN, KG, LT, etc.)
- preco_unitario (preço por unidade em número)
- preco_total (quantidade × preço unitário em número)

RESPONDA APENAS COM UM JSON VÁLIDO no formato:
{
  "estabelecimento": {
    "nome_fantasia": "string",
    "cnpj": "string",
    "endereco": "string"
  },
  "compra": {
    "data_compra": "YYYY-MM-DD",
    "hora_compra": "HH:MM:SS",
    "valor_total": number,
    "numero_nota": "string"
  },
  "itens": [
    {
      "descricao": "string",
      "quantidade": number,
      "unidade": "string", 
      "preco_unitario": number,
      "preco_total": number
    }
  ]
}`
            },
            {
              role: 'user',
              content: `Extraia os dados desta nota fiscal:\n\n${extractedText}`
            }
          ],
          max_completion_tokens: 4000
        }),
      });

      if (!aiResponse.ok) {
        throw new Error(`OpenAI API HTTP ${aiResponse.status}: ${aiResponse.statusText}`);
      }

      aiResult = await aiResponse.json();
      console.log('✅ IA processou com sucesso');
    } catch (aiError) {
      console.error('❌ Erro na chamada para IA:', aiError);
      return new Response(JSON.stringify({
        success: false,
        error: 'AI_PROCESSING_FAILED',
        message: 'Falha no processamento pela IA',
        details: aiError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiContent = aiResult.choices[0]?.message?.content;
    if (!aiContent) {
      return new Response(JSON.stringify({
        success: false,
        error: 'AI_NO_RESPONSE',
        message: 'IA não retornou resposta válida'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🎯 Resposta da IA:', aiContent);

    // 📊 Parse do JSON da resposta
    let dadosExtraidos;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        dadosExtraidos = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Não foi possível encontrar JSON na resposta');
      }
    } catch (parseError) {
      console.error('❌ Erro ao fazer parse da resposta da IA:', parseError);
      return new Response(JSON.stringify({
        success: false,
        error: 'AI_PARSE_FAILED',
        message: 'Falha ao processar resposta da IA',
        details: parseError.message,
        aiResponse: aiContent
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ✅ VALIDAÇÃO: Deve ter pelo menos 1 item extraído
    const totalItens = dadosExtraidos.itens?.length || 0;
    
    if (totalItens === 0) {
      console.error('❌ NENHUM ITEM EXTRAÍDO pela IA');
      console.error('📝 Dados parseados:', JSON.stringify(dadosExtraidos, null, 2));
      
      return new Response(JSON.stringify({
        success: false,
        error: 'NO_ITEMS_EXTRACTED',
        message: 'Falha na extração de texto – verifique se o PDF é baseado em imagem (escaneado)',
        totalItens: 0,
        textoExtraido: extractedText.substring(0, 500),
        dadosExtraidos
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Processamento concluído! ${totalItens} itens extraídos`);

    return new Response(JSON.stringify({
      success: true,
      message: `PDF processado com extração de texto direto - ${totalItens} itens extraídos`,
      metodo: 'extração_texto_básica',
      itens_extraidos: totalItens,
      dados: dadosExtraidos
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro geral no processamento:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'GENERAL_ERROR',
      message: 'Erro interno no processamento',
      details: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Função robusta para extrair texto de PDF no Deno
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log("📄 Extraindo texto do PDF...");
    
    const uint8Array = new Uint8Array(pdfBuffer);
    let pdfString = '';
    
    // Decodificar PDF como string para análise
    try {
      pdfString = new TextDecoder('utf-8').decode(uint8Array);
    } catch {
      pdfString = new TextDecoder('latin1').decode(uint8Array);
    }
    
    console.log('📄 PDF decodificado, tamanho do texto bruto:', pdfString.length);
    
    let extractedText = '';
    
    // Extrair texto de objetos de texto PDF (TJ/Tj commands)
    const textObjectRegex = /\((.*?)\)\s*(?:TJ|Tj)/g;
    let match;
    while ((match = textObjectRegex.exec(pdfString)) !== null) {
      const text = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\(\d{3})/g, (_, code) => String.fromCharCode(parseInt(code, 8)))
        .replace(/\\(.)/g, '$1');
      
      if (text.trim().length > 0) {
        extractedText += text + ' ';
      }
    }
    
    // Extrair texto entre parênteses (formato comum)
    const parenthesesRegex = /\(([^)]+)\)/g;
    while ((match = parenthesesRegex.exec(pdfString)) !== null) {
      const text = match[1];
      if (text.length > 0 && text.length < 200) { // Filtrar textos muito longos
        extractedText += text + ' ';
      }
    }
    
    // Normalizar e limpar texto
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\.,\-\(\)\/\:\$R\%\+\=\@\#]/g, ' ')
      .trim();
    
    console.log('📝 TEXTO EXTRAÍDO DO PDF (primeiros 500 caracteres):');
    console.log(extractedText.substring(0, 500));
    console.log('================================================================================');
    
    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error('Texto insuficiente extraído - PDF pode estar baseado em imagem (escaneado)');
    }
    
    console.log(`✅ Extração concluída. Texto extraído: ${extractedText.length} caracteres`);
    
    return extractedText;
  } catch (error) {
    console.error("❌ Erro ao extrair texto do PDF:", error);
    throw new Error(`TEXT_EXTRACTION_FAILED: ${error.message}`);
  }
}