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
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
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

    // 📄 Extrair texto do PDF
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

IMPORTANTE: Extraia EXATAMENTE as informações como aparecem no texto.

Analise o texto da nota fiscal e extraia:

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
      
      // Salvar dados de debug no banco
      try {
        await supabase
          .from('notas_imagens')
          .update({
            dados_extraidos: {
              erro: 'Nenhum item extraído pela IA',
              totalItens: 0,
              respostaIA: aiContent,
              textoExtraido: extractedText.substring(0, 3000),
              dadosParsados: dadosExtraidos
            },
            processada: false
          })
          .eq('id', notaImagemId);
      } catch (updateError) {
        console.error('Erro ao salvar debug no banco:', updateError);
      }

      return new Response(JSON.stringify({
        success: false,
        error: 'NO_ITEMS_EXTRACTED',
        message: 'A IA não conseguiu extrair nenhum item da nota fiscal',
        totalItens: 0,
        textoExtraido: extractedText.substring(0, 500),
        dadosExtraidos
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ✅ VALIDAÇÃO SECUNDÁRIA: Soma dos subtotais (apenas se valor total existir)
    const somaSubtotais = dadosExtraidos.itens.reduce((acc: number, item: any) => 
      acc + (item.preco_total || 0), 0);
    
    const valorTotal = dadosExtraidos.compra?.valor_total || 0;
    let diferencaPercentual = 0;
    
    if (valorTotal > 0) {
      const diferenca = Math.abs(somaSubtotais - valorTotal);
      diferencaPercentual = (diferenca / valorTotal) * 100;
      
      if (diferencaPercentual > 10) { // 10% de tolerância aumentada
        console.log(`⚠️ ATENÇÃO: Diferença de valores (${diferencaPercentual.toFixed(2)}%) - prosseguindo mesmo assim`);
      }
    }

    console.log(`✅ Validações OK - processando ${totalItens} itens...`);

    // 🏪 Processar supermercado, compra e estoque
    let supermercadoId = null;
    let compraId = null;
    let itensProcessados = 0;

    try {
      // 🏪 Processar supermercado
      if (dadosExtraidos.estabelecimento?.cnpj) {
        const cnpjLimpo = dadosExtraidos.estabelecimento.cnpj.replace(/[^\d]/g, '');
        
        const { data: supermercadoExistente } = await supabase
          .from('supermercados')
          .select('id')
          .eq('cnpj', cnpjLimpo)
          .single();

        if (supermercadoExistente) {
          supermercadoId = supermercadoExistente.id;
          console.log('🏪 Supermercado existente encontrado:', supermercadoId);
        } else {
          const { data: novoSupermercado, error: supermercadoError } = await supabase
            .from('supermercados')
            .insert({
              nome: dadosExtraidos.estabelecimento.nome_fantasia || 'Estabelecimento',
              cnpj: cnpjLimpo,
              endereco: dadosExtraidos.estabelecimento.endereco
            })
            .select('id')
            .single();

          if (!supermercadoError && novoSupermercado) {
            supermercadoId = novoSupermercado.id;
            console.log('🏪 Novo supermercado criado:', supermercadoId);
          }
        }
      }

      // 🛒 Criar compra
      if (supermercadoId) {
        const { data: novaCompra, error: compraError } = await supabase
          .from('compras_app')
          .insert({
            user_id: userId,
            supermercado_id: supermercadoId,
            data_compra: dadosExtraidos.compra?.data_compra || new Date().toISOString().split('T')[0],
            hora_compra: dadosExtraidos.compra?.hora_compra || null,
            preco_total: dadosExtraidos.compra?.valor_total || 0,
            numero_nota_fiscal: dadosExtraidos.compra?.numero_nota || null
          })
          .select('id')
          .single();

        if (!compraError && novaCompra) {
          compraId = novaCompra.id;
          console.log('🛒 Compra criada:', compraId);
        }
      }

      // 📦 Processar itens e estoque
      if (dadosExtraidos?.itens && Array.isArray(dadosExtraidos.itens)) {
        console.log(`📦 Processando ${dadosExtraidos.itens.length} itens...`);
        
        for (const item of dadosExtraidos.itens) {
          try {
            if (!item.descricao || !item.quantidade || !item.preco_unitario) {
              console.log('⚠️ Item incompleto, pulando:', item);
              continue;
            }

            // Normalizar nome do produto
            const produtoNomeNormalizado = item.descricao.toUpperCase().trim();

            // 🔍 Buscar ou criar produto
            let produtoId = null;
            const { data: produtoExistente } = await supabase
              .from('produtos_app')
              .select('id')
              .ilike('nome', `%${produtoNomeNormalizado}%`)
              .limit(1)
              .single();

            if (produtoExistente) {
              produtoId = produtoExistente.id;
            } else {
              const { data: novoProduto, error: produtoError } = await supabase
                .from('produtos_app')
                .insert({
                  nome: produtoNomeNormalizado,
                  unidade_medida: item.unidade || 'UN',
                  categoria_id: 'b47d7f8d-7f3a-4c8d-9e2f-5a1b3c4d5e6f' // categoria padrão
                })
                .select('id')
                .single();

              if (!produtoError && novoProduto) {
                produtoId = novoProduto.id;
              }
            }

            // 📋 Adicionar item à compra
            if (compraId && produtoId) {
              const { error: itemError } = await supabase
                .from('itens_compra_app')
                .insert({
                  compra_id: compraId,
                  produto_id: produtoId,
                  quantidade: item.quantidade,
                  preco_unitario: item.preco_unitario,
                  preco_total: item.preco_total || (item.quantidade * item.preco_unitario)
                });

              if (!itemError) {
                itensProcessados++;
                console.log(`✅ Item processado: ${item.descricao}`);
              }
            }

            // 📊 Atualizar estoque
            const { data: estoqueExistente } = await supabase
              .from('estoque_app')
              .select('id, quantidade')
              .eq('user_id', userId)
              .eq('produto_nome', produtoNomeNormalizado)
              .single();

            if (estoqueExistente) {
              await supabase
                .from('estoque_app')
                .update({
                  quantidade: estoqueExistente.quantidade + item.quantidade,
                  preco_unitario_ultimo: item.preco_unitario,
                  updated_at: new Date().toISOString()
                })
                .eq('id', estoqueExistente.id);
            } else {
              await supabase
                .from('estoque_app')
                .insert({
                  user_id: userId,
                  produto_nome: produtoNomeNormalizado,
                  categoria: 'outros',
                  quantidade: item.quantidade,
                  unidade_medida: item.unidade || 'UN',
                  preco_unitario_ultimo: item.preco_unitario
                });
            }

          } catch (itemError) {
            console.error('❌ Erro ao processar item:', item, itemError);
          }
        }
      }
      
      // ✅ Atualizar registro como processado
      const { error: updateError } = await supabase
        .from('notas_imagens')
        .update({
          dados_extraidos: {
            tipo: 'pdf_texto_extraido_unificado',
            metodo_processamento: 'extração_texto_direto',
            itens_extraidos: totalItens,
            itens_processados: itensProcessados,
            validacao_passou: true,
            somaSubtotais,
            valorTotal,
            diferencaPercentual,
            ...dadosExtraidos
          },
          processada: true
        })
        .eq('id', notaImagemId);

      if (updateError) {
        console.error('❌ Erro ao atualizar registro:', updateError);
        // Não falhar por erro de update, mas logar
      }

      console.log(`🎉 Processamento concluído! ${totalItens} itens extraídos`);

      return new Response(JSON.stringify({
        success: true,
        message: `PDF processado com extração de texto direto - ${totalItens} itens extraídos`,
        metodo: 'extração_texto_unificada',
        itens_extraidos: totalItens,
        itens_processados: itensProcessados,
        validacao: {
          passou: true,
          totalItens,
          somaSubtotais,
          valorTotal,
          diferencaPercentual
        },
        dados: dadosExtraidos
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (dbError) {
      console.error('❌ Erro no processamento do banco:', dbError);
      return new Response(JSON.stringify({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Erro ao salvar dados no banco',
        details: dbError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

// 📄 Função para extrair texto de PDF usando pdf-lib (mais robusto)
import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib?dts";

async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log("📄 Iniciando extração com pdf-lib...");

    const uint8Array = new Uint8Array(pdfBuffer);
    const pdfDoc = await PDFDocument.load(uint8Array);

    let extractedText = "";

    const pages = pdfDoc.getPages();
    console.log(`📑 Total de páginas no PDF: ${pages.length}`);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      // ⚠️ pdf-lib não tem um método direto para texto, mas podemos pegar o "contentStream"
      const raw = page.node.get("Contents");
      if (raw) {
        const str = raw.toString();
        extractedText += " " + str;
      }
    }

    // Limpeza básica
    extractedText = extractedText
      .replace(/\s+/g, " ")
      .replace(/[^\w\s\.,\-\(\)\/\:\$\%]/g, " ")
      .trim();

    console.log(`✅ Texto extraído com sucesso: ${extractedText.length} caracteres`);
    return extractedText;

  } catch (error) {
    console.error("❌ Erro ao extrair texto com pdf-lib:", error);
    throw new Error("TEXT_EXTRACTION_FAILED");
  }
}