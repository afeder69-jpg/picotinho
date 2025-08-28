import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as pdfjsLib from 'https://esm.sh/pdfjs-dist@3.11.174/legacy/build/pdf.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    console.log('📥 Baixando PDF...');
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Erro ao baixar PDF: ${pdfResponse.status}`);
    }
    const pdfBuffer = await pdfResponse.arrayBuffer();

    console.log('📄 Extraindo texto do PDF...');
    const extractedText = await extractTextFromPDF(pdfBuffer);
    
    console.log('🔍 =================================================================');
    console.log('📝 TEXTO BRUTO EXTRAÍDO DO PDF (COMPLETO):');
    console.log('🔍 =================================================================');
    console.log(extractedText);
    console.log('🔍 =================================================================');
    console.log(`📊 Total de caracteres extraídos: ${extractedText.length}`);
    console.log('🔍 =================================================================');

    if (!extractedText || extractedText.length < 50) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INSUFFICIENT_TEXT',
        message: 'Texto insuficiente extraído - fallback para OCR necessário',
        textLength: extractedText.length
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
            content: `Você é um especialista em processar notas fiscais brasileiras (DANFE NFC-e).

Analise este texto de uma nota fiscal brasileira e extraia as informações em JSON:

{
  "estabelecimento": {
    "nome_fantasia": "string",
    "cnpj": "string (formato XX.XXX.XXX/XXXX-XX)",
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
}

IMPORTANTE: 
- Extraia APENAS informações que estão claramente no texto
- Quantidade deve ser número, não string
- Preços devem ser números sem formatação
- Responda APENAS com JSON válido`
          },
          {
            role: 'user',
            content: `Extraia os dados desta nota fiscal:\n\n${extractedText}`
          }
        ],
        max_tokens: 4000
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`OpenAI API erro: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('IA não retornou resposta válida');
    }

    console.log('🎯 Resposta da IA:', aiContent);

    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON não encontrado na resposta da IA');
    }

    const dadosExtraidos = JSON.parse(jsonMatch[0]);
    
    // Validação básica
    if (!dadosExtraidos.itens || dadosExtraidos.itens.length === 0) {
      throw new Error('Nenhum item extraído da nota fiscal');
    }

    // Validação do valor total (tolerância 5%)
    const somaItens = dadosExtraidos.itens.reduce((sum: number, item: any) => sum + (item.preco_total || 0), 0);
    const valorTotal = dadosExtraidos.compra?.valor_total || 0;
    const tolerancia = valorTotal * 0.05;
    
    if (valorTotal > 0 && Math.abs(somaItens - valorTotal) > tolerancia) {
      console.log(`⚠️ Divergência de valores: Soma itens: ${somaItens}, Total: ${valorTotal}`);
    }

    console.log('💾 Salvando dados no banco...');

    // Buscar ou criar supermercado
    let supermercadoId;
    const cnpj = dadosExtraidos.estabelecimento?.cnpj;
    if (cnpj) {
      const { data: supermercadoExistente } = await supabase
        .from('supermercados')
        .select('id')
        .eq('cnpj', cnpj)
        .single();

      if (supermercadoExistente) {
        supermercadoId = supermercadoExistente.id;
      } else {
        const { data: novoSupermercado, error } = await supabase
          .from('supermercados')
          .insert({
            nome: dadosExtraidos.estabelecimento?.nome_fantasia || 'Supermercado',
            cnpj: cnpj,
            endereco: dadosExtraidos.estabelecimento?.endereco
          })
          .select('id')
          .single();

        if (error) throw error;
        supermercadoId = novoSupermercado.id;
      }
    } else {
      // Criar supermercado genérico se não tiver CNPJ
      const { data: novoSupermercado, error } = await supabase
        .from('supermercados')
        .insert({
          nome: dadosExtraidos.estabelecimento?.nome_fantasia || 'Supermercado',
          cnpj: '00.000.000/0000-00'
        })
        .select('id')
        .single();

      if (error) throw error;
      supermercadoId = novoSupermercado.id;
    }

    // Criar compra
    const { data: compra, error: compraError } = await supabase
      .from('compras_app')
      .insert({
        user_id: userId,
        supermercado_id: supermercadoId,
        data_compra: dadosExtraidos.compra?.data_compra || new Date().toISOString().split('T')[0],
        hora_compra: dadosExtraidos.compra?.hora_compra || '12:00:00',
        preco_total: valorTotal,
        numero_nota_fiscal: dadosExtraidos.compra?.numero_nota
      })
      .select('id')
      .single();

    if (compraError) throw compraError;

    // Criar produtos e itens da compra
    for (const item of dadosExtraidos.itens) {
      if (!item.descricao || !item.quantidade || !item.preco_unitario) continue;

      // Buscar ou criar produto
      let produtoId;
      const { data: produtoExistente } = await supabase
        .from('produtos_app')
        .select('id')
        .eq('nome', item.descricao)
        .single();

      if (produtoExistente) {
        produtoId = produtoExistente.id;
      } else {
        // Buscar categoria padrão
        const { data: categoria } = await supabase
          .from('categorias_predefinidas')
          .select('id')
          .limit(1)
          .single();

        const { data: novoProduto, error } = await supabase
          .from('produtos_app')
          .insert({
            nome: item.descricao,
            categoria_id: categoria?.id,
            unidade_medida: item.unidade || 'UN'
          })
          .select('id')
          .single();

        if (error) throw error;
        produtoId = novoProduto.id;
      }

      // Criar item da compra
      await supabase
        .from('itens_compra_app')
        .insert({
          compra_id: compra.id,
          produto_id: produtoId,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          preco_total: item.preco_total || (item.quantidade * item.preco_unitario)
        });

      // Atualizar estoque
      const nomeNormalizado = item.descricao.toUpperCase().trim();
      const { data: estoqueExistente } = await supabase
        .from('estoque_app')
        .select('*')
        .eq('user_id', userId)
        .eq('produto_nome', nomeNormalizado)
        .single();

      if (estoqueExistente) {
        await supabase
          .from('estoque_app')
          .update({
            quantidade: estoqueExistente.quantidade + item.quantidade,
            preco_unitario_ultimo: item.preco_unitario
          })
          .eq('id', estoqueExistente.id);
      } else {
        await supabase
          .from('estoque_app')
          .insert({
            user_id: userId,
            produto_nome: nomeNormalizado,
            categoria: 'outros',
            quantidade: item.quantidade,
            unidade_medida: item.unidade || 'UN',
            preco_unitario_ultimo: item.preco_unitario
          });
      }
    }

    // Atualizar nota como processada
    await supabase
      .from('notas_imagens')
      .update({
        processada: true,
        dados_extraidos: dadosExtraidos,
        compra_id: compra.id
      })
      .eq('id', notaImagemId);

    console.log(`✅ Processamento concluído! ${dadosExtraidos.itens.length} itens salvos`);

    return new Response(JSON.stringify({
      success: true,
      message: `DANFE processada com sucesso - ${dadosExtraidos.itens.length} itens salvos`,
      itens_extraidos: dadosExtraidos.itens.length,
      compra_id: compra.id,
      dados: dadosExtraidos
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro no processamento:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'PROCESSING_ERROR',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    let extractedText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      extractedText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }

    return extractedText.trim();
  } catch (err) {
    console.error('❌ Erro ao extrair texto do PDF:', err);
    throw new Error('TEXT_EXTRACTION_FAILED');
  }
}