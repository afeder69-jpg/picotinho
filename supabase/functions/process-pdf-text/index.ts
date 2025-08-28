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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { notaImagemId, pdfUrl, userId } = await req.json();

    console.log('Iniciando processamento de PDF com extração de texto:', { notaImagemId, pdfUrl, userId });

    // Baixar o PDF
    console.log('Baixando PDF...');
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Falha ao baixar PDF: ${pdfResponse.statusText}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log('PDF baixado, tamanho:', pdfBuffer.byteLength);

    // Tentar extrair texto do PDF
    let extractedText = '';
    try {
      extractedText = await extractTextFromPDF(pdfBuffer);
      console.log('Texto extraído do PDF (primeiros 500 chars):', extractedText.substring(0, 500));
    } catch (error) {
      console.error('Erro na extração de texto:', error);
    }

    // Verificar se conseguimos texto suficiente
    const hasValidText = extractedText.length > 100 && 
                        (extractedText.includes('DANFE') || 
                         extractedText.includes('CUPOM FISCAL') ||
                         extractedText.includes('NOTA FISCAL') ||
                         extractedText.match(/\d+\.\d{3}\.\d{3}\/\d{4}-\d{2}/)); // CNPJ pattern

    if (hasValidText) {
      console.log('PDF contém texto válido, processando com IA...');
      
      // Processar com OpenAI
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
              content: `Você é um assistente especializado em extrair dados de notas fiscais brasileiras (DANFE, Cupom Fiscal).

IMPORTANTE: Extraia EXATAMENTE as informações como aparecem no texto, sem normalizar nomes de produtos.

Analise o texto da nota fiscal e extraia:

1. DADOS DO ESTABELECIMENTO:
- nome_fantasia (nome do supermercado/loja)
- cnpj (formato: XX.XXX.XXX/XXXX-XX)
- endereco (endereço completo)

2. DADOS DA COMPRA:
- data_compra (formato: YYYY-MM-DD)
- hora_compra (formato: HH:MM:SS)
- valor_total (valor total da compra)
- numero_nota (número da nota fiscal)

3. PRODUTOS/ITENS (array):
Para cada item, extraia:
- descricao (nome exato do produto como aparece)
- quantidade (quantidade comprada)
- unidade (UN, KG, LT, etc.)
- preco_unitario (preço por unidade)
- preco_total (quantidade × preço unitário)

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
          max_tokens: 4000,
          temperature: 0.1
        }),
      });

      if (!aiResponse.ok) {
        throw new Error(`OpenAI API error: ${aiResponse.statusText}`);
      }

      const aiResult = await aiResponse.json();
      const aiContent = aiResult.choices[0].message.content;
      
      console.log('Resposta da IA:', aiContent);

      // Parse do JSON da resposta
      let dadosExtraidos;
      try {
        // Limpar a resposta para extrair apenas o JSON
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          dadosExtraidos = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Formato de resposta inválido da IA');
        }
      } catch (parseError) {
        console.error('Erro ao fazer parse da resposta da IA:', parseError);
        throw new Error('Falha ao processar resposta da IA');
      }

      console.log('Dados extraídos estruturados:', JSON.stringify(dadosExtraidos, null, 2));

      // Processar os dados extraídos e salvar no banco
      let itensProcessados = 0;
      
      if (dadosExtraidos && dadosExtraidos.itens && Array.isArray(dadosExtraidos.itens)) {
        console.log(`Processando ${dadosExtraidos.itens.length} itens encontrados...`);
        
        // Buscar ou criar supermercado
        let supermercadoId = null;
        if (dadosExtraidos.estabelecimento?.cnpj) {
          const cnpjLimpo = dadosExtraidos.estabelecimento.cnpj.replace(/[^\d]/g, '');
          
          const { data: supermercadoExistente } = await supabase
            .from('supermercados')
            .select('id')
            .eq('cnpj', cnpjLimpo)
            .single();

          if (supermercadoExistente) {
            supermercadoId = supermercadoExistente.id;
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
            }
          }
        }

        // Criar compra
        let compraId = null;
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
            console.log('Compra criada:', compraId);
          }
        }

        // Processar cada item
        for (const item of dadosExtraidos.itens) {
          try {
            if (!item.descricao || !item.quantidade || !item.preco_unitario) {
              console.log('Item incompleto, pulando:', item);
              continue;
            }

            // Normalizar nome do produto
            const produtoNomeNormalizado = item.descricao.toUpperCase().trim();

            // Buscar ou criar produto
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

            // Adicionar item à compra se temos compra e produto
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
                console.log(`Item processado: ${item.descricao}`);
              }
            }

            // Atualizar estoque
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
            console.error('Erro ao processar item:', item, itemError);
          }
        }
      }

      // Atualizar o registro com os dados extraídos
      const { error: updateError } = await supabase
        .from('notas_imagens')
        .update({
          dados_extraidos: {
            tipo: 'pdf_texto_extraido',
            metodo_processamento: 'extração_texto_direto',
            itens_extraidos: dadosExtraidos.itens?.length || 0,
            itens_processados: itensProcessados,
            ...dadosExtraidos
          },
          processada: true
        })
        .eq('id', notaImagemId);

      if (updateError) {
        console.error('Erro ao atualizar registro:', updateError);
        throw new Error('Falha ao salvar dados extraídos');
      }

      console.log('Processamento de PDF com texto concluído com sucesso');

      return new Response(JSON.stringify({
        success: true,
        message: 'PDF processado com extração de texto direto',
        metodo: 'extração_texto',
        itens_extraidos: dadosExtraidos.itens?.length || 0,
        itens_processados: itensProcessados,
        dados: dadosExtraidos
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      console.log('PDF não contém texto suficiente, será necessário OCR por imagem');
      
      // Retornar indicando que precisa de conversão para imagem
      return new Response(JSON.stringify({
        success: false,
        error: 'PDF_REQUER_OCR',
        message: 'PDF não contém texto suficiente, necessário conversão para imagem',
        requer_conversao_imagem: true
      }), {
        status: 200, // Não é erro, é uma condição esperada
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Erro no processamento de PDF:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Função para extrair texto de PDF usando abordagem direta
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    const uint8Array = new Uint8Array(pdfBuffer);
    
    // Tentar decodificar como UTF-8 primeiro
    let pdfString = '';
    try {
      pdfString = new TextDecoder('utf-8').decode(uint8Array);
    } catch {
      // Se falhar, tentar Latin-1 como fallback
      pdfString = new TextDecoder('latin1').decode(uint8Array);
    }
    
    console.log('PDF decodificado, tamanho do texto:', pdfString.length);
    
    let extractedText = '';
    
    // Método 1: Extrair texto entre parênteses (formato padrão de texto em PDF)
    const textRegex = /\(([^)]+)\)/g;
    let match;
    while ((match = textRegex.exec(pdfString)) !== null) {
      let text = match[1];
      
      // Decodificar escape sequences do PDF
      text = text
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\(\d{3})/g, (_, code) => String.fromCharCode(parseInt(code, 8)))
        .replace(/\\(.)/g, '$1');
      
      if (text.trim().length > 0) {
        extractedText += text + ' ';
      }
    }
    
    // Método 2: Buscar por texto em objetos TJ/Tj (comandos de texto PDF)
    const tjRegex = /(?:TJ|Tj)\s*\[(.*?)\]/g;
    while ((match = tjRegex.exec(pdfString)) !== null) {
      const textArray = match[1];
      // Extrair strings do array
      const stringMatches = textArray.match(/\(([^)]*)\)/g);
      if (stringMatches) {
        for (const str of stringMatches) {
          const cleanStr = str.slice(1, -1); // Remove parênteses
          if (cleanStr.trim().length > 0) {
            extractedText += cleanStr + ' ';
          }
        }
      }
    }
    
    // Método 3: Buscar padrões específicos de DANFE
    const danfePatterns = [
      /DOCUMENTO\s+AUXILIAR[\s\S]{0,50}NOTA\s+FISCAL/i,
      /DANFE[\s\S]{0,100}NFC-?e/i,
      /CUPOM\s+FISCAL[\s\S]{0,50}ELETR[ÔO]NICO/i,
      /CNPJ:?\s*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/i,
      /TOTAL\s+R\$[\s\d,\.]+/i
    ];
    
    for (const pattern of danfePatterns) {
      const matches = pdfString.match(pattern);
      if (matches) {
        extractedText += ' ' + matches[0];
      }
    }
    
    // Limpar e normalizar o texto extraído
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\.,\-\(\)\/\:\$\%]/g, ' ')
      .trim();
    
    console.log(`Texto extraído (${extractedText.length} caracteres):`, extractedText.substring(0, 300));
    
    // Verificar se o texto extraído tem conteúdo relevante para nota fiscal
    const hasRelevantContent = 
      extractedText.length > 100 &&
      (extractedText.match(/\d{2}\/\d{2}\/\d{4}/) || // Data
       extractedText.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || // CNPJ
       extractedText.match(/R\$\s*\d+[,\.]\d{2}/) || // Valor
       extractedText.toLowerCase().includes('danfe') ||
       extractedText.toLowerCase().includes('cupom') ||
       extractedText.toLowerCase().includes('nota fiscal'));
    
    if (hasRelevantContent) {
      console.log('Texto relevante extraído com sucesso');
      return extractedText;
    } else {
      console.log('Texto extraído não contém dados relevantes de nota fiscal');
      return '';
    }
    
  } catch (error) {
    console.error('Erro na extração de texto:', error);
    return '';
  }
}