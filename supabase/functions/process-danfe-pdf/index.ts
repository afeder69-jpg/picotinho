import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 📄 Função para extrair texto dos itens da DANFE
function extractItemsFromDanfe(text: string): string[] {
  // Cada linha da DANFE segue o padrão: 
  // DESCRICAO ... Qtde.:X UN: Y Vl. Unit.: Z Vl. Total W
  const itemRegex = /(.*?)(Qtde\.\:\s*[\d,\.]+)\s*UN\:\s*(\w+)\s*Vl\. Unit\.\:\s*([\d,]+)\s*Vl\. Total\s*([\d,]+)/gi;

  const items: string[] = [];
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const linha = match[0].replace(/\s+/g, ' ').trim();
    items.push(linha);
  }

  return items;
}

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

    console.log('📊 Parâmetros recebidos:', { pdfUrl, notaImagemId, userId });

    if (!pdfUrl || !notaImagemId || !userId) {
      console.error('❌ Parâmetros obrigatórios faltando:', { pdfUrl, notaImagemId, userId });
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
    if (!resp.ok) {
      console.error(`❌ Falha ao baixar PDF: ${resp.status} - ${resp.statusText}`);
      throw new Error(`Falha ao baixar PDF: ${resp.status} - ${resp.statusText}`);
    }
    const buffer = await resp.arrayBuffer();
    console.log(`📊 PDF baixado com sucesso: ${buffer.byteLength} bytes`);

    // 📄 Melhor extração de texto do PDF
    let pdfString = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
    
    // Tentar diferentes decodificações se UTF-8 não funcionar
    if (!pdfString || pdfString.length < 100) {
      pdfString = new TextDecoder("latin1").decode(new Uint8Array(buffer));
    }

    // 📝 Extrair texto de streams de PDF
    let extractedText = "";
    
    // Método 1: Extrair texto entre parênteses (conteúdo textual)
    const textRegex = /\(([^)]+)\)/g;
    let match;
    while ((match = textRegex.exec(pdfString)) !== null) {
      const content = match[1];
      // Filtrar apenas texto legível (não binário)
      if (content && /[a-zA-Z0-9\s]/.test(content) && content.length > 1) {
        extractedText += content + " ";
      }
    }
    
    // Método 2: Extrair texto entre colchetes [texto]
    const bracketRegex = /\[([^\]]+)\]/g;
    while ((match = bracketRegex.exec(pdfString)) !== null) {
      const content = match[1];
      if (content && /[a-zA-Z0-9\s]/.test(content) && content.length > 1) {
        extractedText += content + " ";
      }
    }
    
    // Método 3: Buscar por padrões típicos de DANFE
    const danfePatterns = [
      /DANFE[^a-zA-Z0-9]*([a-zA-Z0-9\s,.-]+)/gi,
      /NFC-e[^a-zA-Z0-9]*([a-zA-Z0-9\s,.-]+)/gi,
      /CNPJ[^0-9]*([0-9.,\s/-]+)/gi,
      /Qtde[^a-zA-Z0-9]*([a-zA-Z0-9\s,.-]+)/gi,
      /Total[^a-zA-Z0-9]*([0-9,.\s]+)/gi,
      /Vl\.Unit[^a-zA-Z0-9]*([0-9,.\s]+)/gi
    ];
    
    for (const pattern of danfePatterns) {
      while ((match = pattern.exec(pdfString)) !== null) {
        if (match[1] && match[1].trim().length > 0) {
          extractedText += match[1].trim() + " ";
        }
      }
    }

    // Limpar e normalizar o texto extraído
    extractedText = extractedText
      .replace(/[^\w\s\d.,:-]/g, ' ') // Remove caracteres especiais
      .replace(/\s+/g, ' ') // Normaliza espaços
      .trim();

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

    // Extrair itens da DANFE usando regex específico
    const itensExtraidosBrutos = extractItemsFromDanfe(extractedText);
    console.log("📝 Itens extraídos do texto da DANFE:");
    console.log(itensExtraidosBrutos);

    // Se não extrair nenhum item, forçar fallback para IA tentar estruturar
    if (itensExtraidosBrutos.length === 0) {
      console.warn("⚠️ Nenhum item detectado pelo regex, enviando texto bruto para IA.");
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
        model: 'gpt-5-2025-08-07',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em extrair dados de DANFE NFC-e (Nota Fiscal Eletrônica do Consumidor).

INSTRUÇÕES CRÍTICAS:
1. SEMPRE responda APENAS com JSON válido - sem texto adicional
2. PROCURE MINUCIOSAMENTE por todos os produtos no texto
3. Produtos em DANFE seguem padrões como:
   - Nome do produto + Qtde + UN + Vl.Unit + Vl.Total
   - Podem ter códigos de sequência (001, 002, etc.)
   - Valores em formato brasileiro (vírgula decimal)

4. CAMPOS OBRIGATÓRIOS por item:
   - descricao: Nome do produto (obrigatório)
   - quantidade: Número (padrão: 1.0)
   - unidade: String (padrão: "UN")
   - preco_unitario: Valor em reais (converta vírgula em ponto)
   - preco_total: Valor total em reais

5. CONVERSÃO DE VALORES:
   - "12,50" → 12.50
   - "1.234,56" → 1234.56

EXTRAIA TAMBÉM: nome do estabelecimento, CNPJ, data/hora da compra, valor total da nota.

Responda SOMENTE com este JSON:`
          },
          {
            role: 'user',
            content: `Analise esta nota fiscal e extraia TODOS os produtos encontrados:

${textoProcessado}`
          }
        ],
        max_completion_tokens: 4000
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

    // 💾 PERSISTIR DADOS NO BANCO
    if (itensExtraidos.length > 0) {
      console.log("💾 Iniciando persistência no banco...");
      
      // 1. Criar supermercado se não existir
      let supermercadoId;
      const { data: supermercadoExistente } = await supabase
        .from('supermercados')
        .select('id')
        .eq('cnpj', dadosExtraidos.estabelecimento?.cnpj || 'DESCONHECIDO')
        .single();

      if (supermercadoExistente) {
        supermercadoId = supermercadoExistente.id;
      } else {
        console.log("💾 Criando supermercado...");
        const { data: novoSupermercado, error: supermercadoError } = await supabase
          .from('supermercados')
          .insert({
            nome: dadosExtraidos.estabelecimento?.nome_fantasia || 'Supermercado',
            cnpj: dadosExtraidos.estabelecimento?.cnpj || 'DESCONHECIDO',
            endereco: dadosExtraidos.estabelecimento?.endereco || '',
            ativo: true
          })
          .select('id')
          .single();

        if (supermercadoError) {
          console.error("❌ Erro ao criar supermercado:", supermercadoError);
        } else {
          supermercadoId = novoSupermercado?.id;
          console.log("✅ Supermercado criado:", supermercadoId);
        }
      }

      // 2. Criar compra
      console.log("💾 Gravando compra:", dadosExtraidos.compra);
      const { data: novaCompra, error: compraError } = await supabase
        .from('compras_app')
        .insert({
          user_id: userId,
          supermercado_id: supermercadoId,
          data_compra: dadosExtraidos.compra?.data_compra || new Date().toISOString().split('T')[0],
          hora_compra: dadosExtraidos.compra?.hora_compra || '00:00:00',
          preco_total: dadosExtraidos.compra?.valor_total || 0,
          numero_nota_fiscal: dadosExtraidos.compra?.numero_nota || '',
          status: 'processada'
        })
        .select('id')
        .single();

      if (compraError) {
        console.error("❌ Erro ao salvar compra:", compraError);
      } else {
        console.log("✅ Compra salva:", novaCompra?.id);

        // 3. Criar/buscar produtos e salvar itens
        console.log("💾 Gravando itens:", dadosExtraidos.itens);
        for (const [index, item] of itensExtraidos.entries()) {
          try {
            // Buscar/criar produto
            let produtoId;
            const { data: produtoExistente } = await supabase
              .from('produtos_app')
              .select('id')
              .eq('nome', item.descricao)
              .single();

            if (produtoExistente) {
              produtoId = produtoExistente.id;
            } else {
              // Buscar primeira categoria disponível para usar como padrão
              const { data: categoriasPadrao } = await supabase
                .from('categorias')
                .select('id')
                .limit(1);
              
              const categoriaId = categoriasPadrao?.[0]?.id || null;
              
              if (!categoriaId) {
                console.error(`❌ Nenhuma categoria disponível para produto ${item.descricao}`);
                continue;
              }

              const { data: novoProduto, error: produtoError } = await supabase
                .from('produtos_app')
                .insert({
                  nome: item.descricao,
                  categoria_id: categoriaId,
                  unidade_medida: item.unidade || 'UN',
                  ativo: true
                })
                .select('id')
                .single();

              if (produtoError) {
                console.error(`❌ Erro ao criar produto ${item.descricao}:`, produtoError);
                continue;
              }
              produtoId = novoProduto?.id;
            }

            // Salvar item da compra
            const { error: itemError } = await supabase
              .from('itens_compra_app')
              .insert({
                compra_id: novaCompra.id,
                produto_id: produtoId,
                quantidade: item.quantidade || 1,
                preco_unitario: item.preco_unitario || 0,
                preco_total: item.preco_total || 0
              });

            if (itemError) {
              console.error(`❌ Erro ao salvar item ${item.descricao}:`, itemError);
            } else {
              console.log(`✅ Item salvo: ${item.descricao}`);
            }

            // Atualizar estoque
            const { data: estoqueExistente } = await supabase
              .from('estoque_app')
              .select('*')
              .eq('user_id', userId)
              .eq('produto_nome', item.descricao)
              .single();

            if (estoqueExistente) {
              // Atualizar quantidade existente
              const { error: estoqueUpdateError } = await supabase
                .from('estoque_app')
                .update({
                  quantidade: (estoqueExistente.quantidade || 0) + (item.quantidade || 1),
                  preco_unitario_ultimo: item.preco_unitario || 0,
                  updated_at: new Date().toISOString()
                })
                .eq('id', estoqueExistente.id);

              if (estoqueUpdateError) {
                console.error(`❌ Erro ao atualizar estoque ${item.descricao}:`, estoqueUpdateError);
              } else {
                console.log(`✅ Estoque atualizado: ${item.descricao}`);
              }
            } else {
              // Criar novo item no estoque
              const { error: estoqueInsertError } = await supabase
                .from('estoque_app')
                .insert({
                  user_id: userId,
                  produto_nome: item.descricao,
                  categoria: 'outros',
                  quantidade: item.quantidade || 1,
                  unidade_medida: item.unidade || 'UN',
                  preco_unitario_ultimo: item.preco_unitario || 0
                });

              if (estoqueInsertError) {
                console.error(`❌ Erro ao criar estoque ${item.descricao}:`, estoqueInsertError);
              } else {
                console.log(`✅ Estoque criado: ${item.descricao}`);
              }
            }

          } catch (itemProcessError) {
            console.error(`❌ Erro ao processar item ${index + 1}:`, itemProcessError);
          }
        }

        // Atualizar referência da compra na nota
        await supabase
          .from('notas_imagens')
          .update({ compra_id: novaCompra.id })
          .eq('id', notaImagemId);
      }
    }

    // Atualizar nota como processada (independente dos itens encontrados)
    const { error: updateError } = await supabase
      .from('notas_imagens')
      .update({
        processada: true,
        dados_extraidos: dadosCompletos
      })
      .eq('id', notaImagemId);

    if (updateError) {
      console.error('❌ Erro ao atualizar nota como processada:', updateError);
    } else {
      console.log('✅ Nota marcada como processada no banco');
    }

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
    console.error('❌ Stack trace:', error.stack);
    
    // Tentar marcar a nota como processada mesmo com erro para debug
    try {
      await supabase
        .from('notas_imagens')
        .update({
          processada: false,
          dados_extraidos: {
            erro_geral: true,
            erro_mensagem: error.message,
            erro_stack: error.stack,
            timestamp_erro: new Date().toISOString()
          }
        })
        .eq('id', notaImagemId);
    } catch (updateError) {
      console.error('❌ Erro ao salvar informações do erro:', updateError);
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: "GENERAL_ERROR",
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});