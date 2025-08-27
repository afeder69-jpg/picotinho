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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { notaImagemId, imageUrl, qrUrl } = await req.json();

    console.log('Processando nota fiscal:', { notaImagemId, imageUrl, qrUrl });

    // Processa a imagem com OpenAI Vision
    const prompt = `
Analise esta imagem de nota fiscal brasileira e extraia TODOS os dados estruturados em JSON válido.

Retorne um JSON com esta estrutura exata:
{
  "supermercado": {
    "nome": "Nome completo do estabelecimento",
    "cnpj": "CNPJ formatado (XX.XXX.XXX/XXXX-XX)",
    "endereco": "Endereço completo"
  },
  "compra": {
    "data": "YYYY-MM-DD",
    "hora": "HH:MM:SS",
    "valorTotal": 99.99,
    "formaPagamento": "Tipo de pagamento",
    "numeroNotaFiscal": "Número da NF-e",
    "chaveAcesso": "Chave de acesso da NFe (44 dígitos)"
  },
  "produtos": [
    {
      "nome": "Nome do produto",
      "marca": "Marca se identificável",
      "categoria": "Categoria inferida",
      "quantidade": 1.5,
      "unidadeMedida": "UN/KG/LT/etc",
      "precoUnitario": 10.50,
      "precoTotal": 15.75,
      "desconto": 0.00
    }
  ]
}

IMPORTANTE:
- Extraia TODOS os produtos da nota, linha por linha
- Calcule categorias baseadas no nome do produto (ex: Refrigerantes, Carnes, Laticínios, etc.)
- Valores devem ser numéricos, não strings
- Se algum dado não estiver visível, use null
- Mantenha a formatação JSON válida
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 2000,
      }),
    });

    const openaiData = await response.json();
    console.log('Resposta OpenAI:', openaiData);

    if (!openaiData.choices?.[0]?.message?.content) {
      throw new Error('Resposta inválida da OpenAI');
    }

    const extractedData = JSON.parse(openaiData.choices[0].message.content);
    console.log('Dados extraídos:', extractedData);

    // Busca ou cria supermercado
    let supermercado;
    if (extractedData.supermercado?.cnpj) {
      const { data: existingSupermercado } = await supabase
        .from('supermercados')
        .select('*')
        .eq('cnpj', extractedData.supermercado.cnpj)
        .single();

      if (existingSupermercado) {
        supermercado = existingSupermercado;
      } else {
        const { data: newSupermercado, error: supermercadoError } = await supabase
          .from('supermercados')
          .insert({
            nome: extractedData.supermercado.nome,
            cnpj: extractedData.supermercado.cnpj,
            endereco: extractedData.supermercado.endereco
          })
          .select()
          .single();

        if (supermercadoError) throw supermercadoError;
        supermercado = newSupermercado;
      }
    }

    // Busca dados da imagem da nota
    const { data: notaImagem, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', notaImagemId)
      .single();

    if (notaError) throw notaError;

    // Cria compra
    const { data: compra, error: compraError } = await supabase
      .from('compras_app')
      .insert({
        user_id: notaImagem.usuario_id,
        supermercado_id: supermercado?.id,
        data_compra: extractedData.compra.data,
        hora_compra: extractedData.compra.hora,
        preco_total: extractedData.compra.valorTotal || 0,
        forma_pagamento: extractedData.compra.formaPagamento,
        numero_nota_fiscal: extractedData.compra.numeroNotaFiscal,
        chave_acesso: extractedData.compra.chaveAcesso,
        qr_code_url: qrUrl,
        status: 'processada'
      })
      .select()
      .single();

    if (compraError) throw compraError;

    // 🧠 Função avançada para normalizar nomes de produtos
    const normalizarNomeProduto = (nome: string): string => {
      return nome
        .toUpperCase()
        .trim()
        // Primeiro passo: correções de OCR comuns e acentos
        .replace(/\bGRAENC\b/gi, 'GRANEL')
        .replace(/\bGRANEL\b/gi, 'GRANEL')
        .replace(/\bREQUEIJAO\b/gi, 'REQUEIJAO')
        .replace(/\bBISC0IT0\b/gi, 'BISCOITO')
        .replace(/\bL3IT3\b/gi, 'LEITE')
        .replace(/\bÇUCAR\b/gi, 'AÇUCAR')
        .replace(/\bARR0Z\b/gi, 'ARROZ')
        .replace(/\bFEIJÃ0\b/gi, 'FEIJAO')
        .replace(/\b(MARACUJ[AÁ]?)\b/gi, 'MARACUJA')
        .replace(/\b(LIM[AÃ]O)\b/gi, 'LIMAO')
        .replace(/\b(MAM[AÃ]O)\b/gi, 'MAMAO')
        .replace(/\b(MU[CÇ]ARELA)\b/gi, 'MUCARELA')
        .replace(/\b(A[CÇ]UCAR)\b/gi, 'ACUCAR')
        
        // Segundo passo: padronizar formatos de pães
        .replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b/gi, 'PAO DE FORMA')
        
        // Padronizar achocolatado
        .replace(/\b(ACHOCOLATADO EM PO NESCAU)\s*(380G|3\.0|30KG|\d+G)?\b/gi, 'ACHOCOLATADO EM PO')
        
        // Terceiro passo: remover especificações de peso/tamanho que variam
        .replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL)\b/gi, '')
        .replace(/\b\d+G\b/gi, '') // Remove qualquer especificação de gramagem
        .replace(/\b\d+ML\b/gi, '') // Remove especificação de volume
        .replace(/\b\d+L\b/gi, '') // Remove especificação de litros
        .replace(/\b\d+KG\b/gi, '') // Remove especificação de quilogramas
        
        // Quarto passo: padronizar ordem das palavras para frutas
        .replace(/\b(KG\s+AZEDO)\b/gi, 'AZEDO KG')
        .replace(/\b(AZEDO\s+KG)\b/gi, 'AZEDO KG')
        .replace(/\bGRANEL\s*KG\b/gi, 'KG GRANEL')
        .replace(/\bKG\s*GRANEL\b/gi, 'GRANEL KG')
        
        // Quinto passo: remover marcas específicas para produtos genéricos
        .replace(/\b(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA|NESTLE|COCA|PEPSI|NESCAU|DOMILAC|LAC\s*FREE|ZILAC|GRAN\s*MESTRE|BATAVO|ELEFANTE|GRANFINO)\b/gi, '')
        
        // Sexto passo: limpar espaços múltiplos e caracteres especiais
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
    };

    // 🎯 Função para calcular similaridade entre strings (Algoritmo de Jaro-Winkler simplificado)
    const calcularSimilaridade = (str1: string, str2: string): number => {
      if (str1 === str2) return 1.0;
      
      const len1 = str1.length;
      const len2 = str2.length;
      
      if (len1 === 0 || len2 === 0) return 0.0;
      
      // Distância de Levenshtein simplificada
      const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
      
      for (let i = 0; i <= len1; i++) matrix[i][0] = i;
      for (let j = 0; j <= len2; j++) matrix[0][j] = j;
      
      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,     // deletar
            matrix[i][j - 1] + 1,     // inserir
            matrix[i - 1][j - 1] + cost // substituir
          );
        }
      }
      
      const maxLen = Math.max(len1, len2);
      return (maxLen - matrix[len1][len2]) / maxLen;
    };

    // Processa produtos e atualiza estoque automaticamente
    if (extractedData.produtos && Array.isArray(extractedData.produtos)) {
      console.log('📦 Atualizando estoque automaticamente...');
      
      for (const produtoData of extractedData.produtos) {
        try {
          const nomeNormalizado = normalizarNomeProduto(produtoData.nome);
          console.log(`🏷️ Produto original: "${produtoData.nome}" -> Normalizado: "${nomeNormalizado}"`);
          
          // Verificar se já existe um produto similar no estoque
          const { data: estoqueLista, error: estoqueListaError } = await supabase
            .from('estoque_app')
            .select('*')
            .eq('user_id', notaImagem.usuario_id);

          if (estoqueListaError) {
            console.error('Erro ao buscar lista de estoque:', estoqueListaError);
            continue;
          }

          // 🎯 Procurar produto similar usando algoritmo inteligente
          let produtoSimilar = null;
          if (estoqueLista && estoqueLista.length > 0) {
            // Primeiro: tentar match exato com o nome normalizado
            produtoSimilar = estoqueLista.find(prod => 
              normalizarNomeProduto(prod.produto_nome) === nomeNormalizado
            );
            
            // Segundo: se não achou exato, buscar por similaridade alta (>85%)
            if (!produtoSimilar) {
              let melhorSimilaridade = 0;
              for (const item of estoqueLista) {
                const nomeExistente = normalizarNomeProduto(item.produto_nome);
                const similaridade = calcularSimilaridade(nomeNormalizado, nomeExistente);
                
                if (similaridade >= 0.85 && similaridade > melhorSimilaridade) {
                  melhorSimilaridade = similaridade;
                  produtoSimilar = item;
                }
              }
            }
          }

          if (produtoSimilar) {
            // 📈 Atualizar produto existente
            const novaQuantidade = produtoSimilar.quantidade + (produtoData.quantidade || 1);
            
            const { error: updateError } = await supabase
              .from('estoque_app')
              .update({
                quantidade: novaQuantidade,
                preco_unitario_ultimo: produtoData.precoUnitario || produtoSimilar.preco_unitario_ultimo,
                updated_at: new Date().toISOString()
              })
              .eq('id', produtoSimilar.id);

            if (updateError) {
              console.error('Erro ao atualizar estoque:', updateError);
            } else {
              console.log(`✅ Estoque atualizado: ${produtoSimilar.produto_nome} (${produtoSimilar.quantidade} + ${produtoData.quantidade || 1} = ${novaQuantidade})`);
            }
          } else {
            // 🆕 Criar novo item no estoque
            const { error: insertError } = await supabase
              .from('estoque_app')
              .insert({
                user_id: notaImagem.usuario_id,
                produto_nome: nomeNormalizado, // Usar nome normalizado
                categoria: produtoData.categoria || 'outros',
                quantidade: produtoData.quantidade || 1,
                unidade_medida: produtoData.unidadeMedida || 'UN',
                preco_unitario_ultimo: produtoData.precoUnitario || 0
              });

            if (insertError) {
              console.error('Erro ao inserir no estoque:', insertError);
            } else {
              console.log(`🆕 Novo item no estoque: ${nomeNormalizado} (${produtoData.quantidade || 1} ${produtoData.unidadeMedida || 'UN'})`);
            }
          }

          // Busca ou cria categoria
          let categoria;
          if (produtoData.categoria) {
            const { data: existingCategoria } = await supabase
              .from('categorias')
              .select('*')
              .eq('nome', produtoData.categoria)
              .eq('user_id', notaImagem.usuario_id)
              .single();

            if (existingCategoria) {
              categoria = existingCategoria;
            } else {
              const { data: newCategoria } = await supabase
                .from('categorias')
                .insert({
                  nome: produtoData.categoria,
                  user_id: notaImagem.usuario_id,
                  cor: '#6366f1',
                  icone: 'Package'
                })
                .select()
                .single();
              categoria = newCategoria;
            }
          }

          // Busca ou cria produto
          let produto;
          const { data: existingProduto } = await supabase
            .from('produtos_app')
            .select('*')
            .eq('nome', nomeNormalizado) // Usar nome normalizado para busca
            .single();

          if (existingProduto) {
            produto = existingProduto;
          } else {
            const { data: newProduto } = await supabase
              .from('produtos_app')
              .insert({
                nome: nomeNormalizado, // Usar nome normalizado
                marca: produtoData.marca,
                categoria_id: categoria?.id,
                unidade_medida: produtoData.unidadeMedida || 'unidade'
              })
              .select()
              .single();
            produto = newProduto;
          }

          // Cria item da compra
          await supabase
            .from('itens_compra_app')
            .insert({
              compra_id: compra.id,
              produto_id: produto.id,
              quantidade: produtoData.quantidade || 1,
              preco_unitario: produtoData.precoUnitario || 0,
              preco_total: produtoData.precoTotal || 0,
              desconto_item: produtoData.desconto || 0
            });

        } catch (produtoError) {
          console.error('Erro ao processar produto:', produtoData.nome, produtoError);
        }
      }
    }

    // Atualiza compra_id na nota de imagem e marca como processada
    await supabase
      .from('notas_imagens')
      .update({
        compra_id: compra.id,
        processada: true,
        dados_extraidos: extractedData
      })
      .eq('id', notaImagemId);

    console.log('Processamento concluído com sucesso');

    return new Response(
      JSON.stringify({ 
        success: true, 
        compraId: compra.id,
        produtosProcessados: extractedData.produtos?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro no processamento:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro no processamento da nota fiscal',
        details: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});