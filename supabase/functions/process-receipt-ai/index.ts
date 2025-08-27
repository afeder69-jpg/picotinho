import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  console.log('🚀 Edge function process-receipt-ai iniciada');
  console.log('📋 Método da requisição:', req.method);
  console.log('📋 Headers:', Object.fromEntries(req.headers.entries()));
  
  // Verificar variáveis de ambiente no início
  console.log('🔍 Verificando secrets...');
  console.log('OPENAI_API_KEY existe:', !!openAIApiKey);
  console.log('SUPABASE_URL existe:', !!supabaseUrl);
  console.log('SUPABASE_SERVICE_ROLE_KEY existe:', !!supabaseServiceKey);
  
  if (req.method === 'OPTIONS') {
    console.log('✅ Retornando resposta OPTIONS para CORS');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Verificando variáveis de ambiente...');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL não configurada');
    }
    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');
    }

    console.log('📥 Processando body da requisição...');
    const body = await req.json();
    console.log('📦 Body recebido:', body);
    
    const { notaId, imageUrl } = body;
    
    console.log('✅ Dados extraídos:', { notaId, imageUrl });

    if (!notaId || !imageUrl) {
      throw new Error('notaId e imageUrl são obrigatórios');
    }

    // Criar cliente Supabase com Service Role (bypassa RLS)
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      db: {
        schema: 'public'
      }
    });

    // Buscar a nota fiscal
    const { data: nota, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', notaId)
      .single();

    if (notaError || !nota) {
      throw new Error('Nota fiscal não encontrada');
    }

    console.log('Found receipt:', nota);

    // Verificar se é um arquivo PDF pela URL
    const fileExtension = nota.imagem_url.toLowerCase().split('.').pop();
    const originalExtension = nota.nome_original?.toLowerCase().split('.').pop();
    
    console.log('🔍 Extensão do arquivo original:', originalExtension);
    console.log('🔍 Extensão da URL:', fileExtension);
    console.log('🔍 Nome original:', nota.nome_original);
    console.log('🔍 URL da imagem recebida:', imageUrl);
    console.log('🔍 URL da nota no banco:', nota.imagem_url);
    
    // Verificar se a URL recebida é um JPG (convertido) mesmo quando o original é PDF
    const imageUrlExtension = imageUrl.toLowerCase().split('.').pop();
    console.log('🔍 Extensão da imageUrl:', imageUrlExtension);
    
    const isPDF = imageUrl.toLowerCase().includes('.pdf');
    console.log('🔍 imageUrl é PDF?', isPDF);
    
    if (isPDF) {
      console.error('❌ PDFs não são suportados pela API de visão da OpenAI');
      throw new Error('Arquivos PDF não são suportados para extração com IA. Por favor, faça upload de uma imagem da nota fiscal (PNG, JPEG, etc.)');
    }

    // Preparar prompt para IA
    const prompt = `
Você é um especialista em análise de notas fiscais brasileiras. Analise cuidadosamente esta imagem de nota fiscal/cupom fiscal eletrônico e extraia TODAS as informações visíveis.

IMPORTANTE: Esta pode ser uma imagem convertida de PDF, então olhe com atenção para todos os detalhes, mesmo que a qualidade não seja perfeita.

Retorne APENAS um JSON válido com esta estrutura exata:

{
  "dataCompra": "YYYY-MM-DD",
  "horaCompra": "HH:MM",
  "valorTotal": 0.00,
  "loja": {
    "nome": "Nome da Loja",
    "cnpj": "00.000.000/0000-00",
    "endereco": "Endereço completo"
  },
  "formaPagamento": "PIX/Cartão/Dinheiro/etc",
  "itens": [
    {
      "descricao": "Nome do produto",
      "quantidade": 1.0,
      "unidadeMedida": "UN/KG/L/etc",
      "valorUnitario": 0.00,
      "valorTotal": 0.00,
      "categoria": "laticínios/bebidas/frutas/carnes/limpeza/etc"
    }
  ]
}

INSTRUÇÕES ESPECÍFICAS:
1. Procure por: "CUPOM FISCAL ELETRÔNICO", "NOTA FISCAL", "DANFE", ou cabeçalhos similares
2. Data: Procure por "DATA" ou formato dd/mm/yyyy
3. Hora: Procure por "HORA" ou formato hh:mm
4. Loja: Nome da empresa no topo
5. CNPJ: Procure por "CNPJ:" seguido de números
6. Endereço: Abaixo do nome da empresa
7. Itens: Lista de produtos com códigos, descrições, quantidades e valores
8. Total: "TOTAL", "VALOR TOTAL" ou "R$" no final
9. Pagamento: "PIX", "CARTÃO", "DINHEIRO", "DÉBITO", "CRÉDITO"

CATEGORIZAÇÃO:
- laticínios: leite, queijo, iogurte, manteiga, cream cheese
- bebidas: refrigerante, suco, água, cerveja, vinho
- frutas: maçã, banana, laranja, uva, etc.
- verduras: alface, tomate, cebola, cenoura, etc.
- carnes: bovina, suína, frango, peixe
- pães: pão, biscoito, bolo, torrada
- limpeza: detergente, sabão, desinfetante
- higiene: shampoo, sabonete, pasta de dente
- outros: para itens que não se encaixam

VALORES E UNIDADES:
- Remova "R$", vírgulas como separadores de milhar
- Use ponto como separador decimal (ex: 15.99)
- Unidades: UN, KG, G, L, ML, PC, CX, PCT
- Multiplique quantidade × valor unitário = valor total do item

Se a imagem estiver muito borrada ou ilegível, tente extrair o que conseguir ver e use null para campos não visíveis.
SEMPRE retorne um JSON válido, mesmo que com campos null.
`;

    // Chamar OpenAI Vision API
    console.log('🤖 Preparando chamada para OpenAI...');
    console.log('🔑 OpenAI Key prefix:', openAIApiKey?.substring(0, 7) + '...');
    
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14', // Usar modelo mais recente
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_completion_tokens: 2000 // Usar max_completion_tokens para modelos novos
      }),
    });

    console.log('📡 OpenAI Response Status:', openAIResponse.status);
    console.log('📡 OpenAI Response Headers:', Object.fromEntries(openAIResponse.headers.entries()));

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('❌ OpenAI API Error Response:', errorText);
      throw new Error(`OpenAI API error: ${openAIResponse.status} - ${errorText}`);
    }

    const aiResult = await openAIResponse.json();
    console.log('🎯 OpenAI Result:', JSON.stringify(aiResult, null, 2));
    
    const extractedText = aiResult.choices?.[0]?.message?.content;
    
    console.log('📝 AI Response Text:', extractedText);

    if (!extractedText) {
      throw new Error('Resposta vazia da OpenAI');
    }

    // Parse JSON da resposta da IA
    let dadosExtraidos;
    try {
      // Limpar resposta da IA para extrair apenas o JSON
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON não encontrado na resposta da IA');
      }
      dadosExtraidos = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Erro ao fazer parse do JSON:', parseError);
      throw new Error('Erro ao processar resposta da IA');
    }

    console.log('Extracted data:', dadosExtraidos);

    // Verificar se já existe supermercado
    let supermercadoId = null;
    
    try {
      if (dadosExtraidos.loja?.cnpj) {
        const { data: supermercadoExistente } = await supabase
          .from('supermercados')
          .select('id')
          .eq('cnpj', dadosExtraidos.loja.cnpj)
          .single();

        if (supermercadoExistente) {
          supermercadoId = supermercadoExistente.id;
        } else {
          // Criar novo supermercado
          const { data: novoSupermercado, error: supermercadoError } = await supabase
            .from('supermercados')
            .insert({
              nome: dadosExtraidos.loja?.nome || 'Supermercado Desconhecido',
              cnpj: dadosExtraidos.loja?.cnpj || '00.000.000/0000-00',
              endereco: dadosExtraidos.loja?.endereco || 'Endereço não informado'
            })
            .select('id')
            .single();

          if (supermercadoError) {
            console.error('Erro ao criar supermercado:', supermercadoError);
            console.log('🟡 Continuando sem supermercado específico');
          } else {
            supermercadoId = novoSupermercado.id;
          }
        }
      }
    } catch (error) {
      console.error('Erro ao processar supermercado:', error);
      console.log('🟡 Continuando sem supermercado específico');
    }

    // Se não conseguiu encontrar/criar supermercado, FORÇAR criação de um padrão
    if (!supermercadoId) {
      console.log('🟡 FORÇANDO criação de supermercado padrão pois supermercado_id é obrigatório');
      
      // Tentar criar com um CNPJ único baseado no timestamp
      const cnpjPadrao = `99.999.999/${Date.now().toString().slice(-4)}-99`;
      
      const { data: supermercadoPadrao, error: defaultError } = await supabase
        .from('supermercados')
        .insert({
          nome: 'Supermercado Não Identificado',
          cnpj: cnpjPadrao,
          endereco: 'Endereço não informado'
        })
        .select('id')
        .single();

      if (defaultError) {
        console.error('❌ Erro crítico ao criar supermercado padrão:', defaultError);
        // Como último recurso, buscar qualquer supermercado existente
        const { data: qualquerSupermercado } = await supabase
          .from('supermercados')
          .select('id')
          .limit(1)
          .single();
          
        if (qualquerSupermercado) {
          supermercadoId = qualquerSupermercado.id;
          console.log('🟡 Usando supermercado existente como fallback:', supermercadoId);
        } else {
          throw new Error('Erro crítico: Não foi possível garantir um supermercado_id válido');
        }
      } else {
        supermercadoId = supermercadoPadrao.id;
        console.log('✅ Supermercado padrão criado com sucesso:', supermercadoId);
      }
    }

    // Criar compra
    const compraData = {
      user_id: nota.usuario_id,
      supermercado_id: supermercadoId,
      data_compra: dadosExtraidos.dataCompra || new Date().toISOString().split('T')[0],
      hora_compra: dadosExtraidos.horaCompra || null,
      preco_total: parseFloat(dadosExtraidos.valorTotal || 0),
      forma_pagamento: dadosExtraidos.formaPagamento || 'Não informado',
      observacoes: `Processada automaticamente da nota: ${nota.nome_original || nota.id}`
    };

    console.log('📝 Dados da compra:', compraData);

    const { data: compra, error: compraError } = await supabase
      .from('compras_app')
      .insert(compraData)
      .select('id')
      .single();

    if (compraError) {
      console.error('❌ Erro DETALHADO ao criar compra:', JSON.stringify(compraError, null, 2));
      console.error('❌ Dados enviados:', JSON.stringify(compraData, null, 2));
      console.error('❌ Tipo do erro:', typeof compraError);
      console.error('❌ Código do erro:', compraError.code);
      console.error('❌ Mensagem do erro:', compraError.message);
      throw new Error(`Erro ao salvar compra: ${compraError.message} | Código: ${compraError.code}`);
    }

    console.log('Created purchase:', compra);

    // Processar itens
    const itensParaInserir = [];
    for (const item of dadosExtraidos.itens || []) {
      // Buscar ou criar produto
      let produtoId = null;
      
      // Buscar produto existente
      const { data: produtoExistente } = await supabase
        .from('produtos_app')
        .select('id')
        .ilike('nome', `%${item.descricao}%`)
        .limit(1)
        .single();

      if (produtoExistente) {
        produtoId = produtoExistente.id;
      } else {
        // Buscar categoria por nome
        let categoriaId = null;
        if (item.categoria) {
          const { data: categoria } = await supabase
            .from('categorias')
            .select('id')
            .ilike('nome', `%${item.categoria}%`)
            .limit(1)
            .single();
          
          if (categoria) {
            categoriaId = categoria.id;
          }
        }

        // Se não encontrou categoria, usar uma padrão
        if (!categoriaId) {
          const { data: categoriaDefault } = await supabase
            .from('categorias')
            .select('id')
            .limit(1)
            .single();
          
          if (categoriaDefault) {
            categoriaId = categoriaDefault.id;
          }
        }

        // Criar novo produto se tiver categoria
        if (categoriaId) {
          const { data: novoProduto, error: produtoError } = await supabase
            .from('produtos_app')
            .insert({
              nome: item.descricao,
              categoria_id: categoriaId,
              unidade_medida: item.unidadeMedida || 'UN'
            })
            .select('id')
            .single();

          if (!produtoError && novoProduto) {
            produtoId = novoProduto.id;
          }
        }
      }

      if (produtoId) {
        itensParaInserir.push({
          compra_id: compra.id,
          produto_id: produtoId,
          quantidade: item.quantidade,
          preco_unitario: item.valorUnitario,
          preco_total: item.valorTotal
        });
      }
    }

    // Inserir itens
    if (itensParaInserir.length > 0) {
      const { error: itensError } = await supabase
        .from('itens_compra_app')
        .insert(itensParaInserir);

      if (itensError) {
        console.error('Erro ao inserir itens:', itensError);
      }
    }

    // 📦 Atualizar estoque automaticamente
    console.log('📦 Atualizando estoque...\n');
    
    // 🧠 Função avançada para normalizar nomes de produtos
    const normalizarNomeProduto = (nome: string): string => {
      return nome
        .toUpperCase()
        .trim()
        // Primeiro passo: correções de OCR comuns
        .replace(/\bGRAENC\b/gi, 'GRANEL')
        .replace(/\bGRANEL\b/gi, 'GRANEL')
        .replace(/\bREQUEIJAO\b/gi, 'REQUEIJAO')
        .replace(/\bBISC0IT0\b/gi, 'BISCOITO')
        .replace(/\bL3IT3\b/gi, 'LEITE')
        .replace(/\bÇUCAR\b/gi, 'AÇUCAR')
        .replace(/\bARR0Z\b/gi, 'ARROZ')
        .replace(/\bFEIJÃ0\b/gi, 'FEIJAO')
        
        // Segundo passo: padronizar formatos de pães
        .replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b/gi, 'PAO DE FORMA')
        
        // Terceiro passo: remover especificações de peso/tamanho que variam
        .replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0)\b/gi, '')
        .replace(/\b\d+G\b/gi, '') // Remove qualquer especificação de gramagem
        .replace(/\b\d+ML\b/gi, '') // Remove especificação de volume
        .replace(/\b\d+L\b/gi, '') // Remove especificação de litros
        
        // Quarto passo: padronizar ordem das palavras
        .replace(/\bGRANEL\s*KG\b/gi, 'KG GRANEL')
        .replace(/\bKG\s*GRANEL\b/gi, 'GRANEL KG')
        
        // Quinto passo: remover marcas específicas para produtos genéricos
        .replace(/\b(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA|NESTLE|COCA|PEPSI)\b/gi, '')
        
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

    // 🔍 Função para encontrar produto mais similar no estoque
    const encontrarProdutoSimilar = (nomeNovo: string, estoqueUsuario: any[]): any => {
      let melhorMatch = null;
      let melhorSimilaridade = 0;
      
      for (const item of estoqueUsuario) {
        const nomeExistente = normalizarNomeProduto(item.produto_nome);
        const similaridade = calcularSimilaridade(nomeNovo, nomeExistente);
        
        // Se a similaridade for >= 85%, considerar como mesmo produto
        if (similaridade >= 0.85 && similaridade > melhorSimilaridade) {
          melhorSimilaridade = similaridade;
          melhorMatch = item;
        }
      }
      
      console.log(`🔍 Procurando similar para "${nomeNovo}":`, melhorMatch ? `${melhorMatch.produto_nome} (${(melhorSimilaridade * 100).toFixed(1)}%)` : 'Nenhum similar encontrado');
      
      return melhorMatch;
    };
    
    for (const item of dadosExtraidos.itens || []) {
      try {
        const nomeNormalizado = normalizarNomeProduto(item.descricao);
        
        // Verificar se já existe um produto similar no estoque
        const { data: estoqueLista, error: estoqueListaError } = await supabase
          .from('estoque_app')
          .select('*')
          .eq('user_id', nota.usuario_id);

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
          
          // Se não encontrou match exato, usar algoritmo de similaridade
          if (!produtoSimilar) {
            produtoSimilar = encontrarProdutoSimilar(nomeNormalizado, estoqueLista);
          }
        }

        if (produtoSimilar) {
          // Atualizar quantidade existente
          const novaQuantidade = parseFloat(produtoSimilar.quantidade) + parseFloat(item.quantidade || 0);
          
          const { error: updateError } = await supabase
            .from('estoque_app')
            .update({
              quantidade: novaQuantidade,
              preco_unitario_ultimo: item.valorUnitario,
              updated_at: new Date().toISOString()
            })
            .eq('id', produtoSimilar.id);

          if (updateError) {
            console.error('Erro ao atualizar estoque:', updateError);
          } else {
            console.log(`✅ Estoque atualizado: ${produtoSimilar.produto_nome} (${produtoSimilar.quantidade} + ${item.quantidade} = ${novaQuantidade})\n`);
          }
        } else {
          // Criar novo item no estoque com nome normalizado
          const { error: insertError } = await supabase
            .from('estoque_app')
            .insert({
              user_id: nota.usuario_id,
              produto_nome: nomeNormalizado,
              categoria: item.categoria || 'outros',
              unidade_medida: item.unidadeMedida || 'UN',
              quantidade: item.quantidade || 0,
              preco_unitario_ultimo: item.valorUnitario
            });

          if (insertError) {
            console.error('Erro ao inserir no estoque:', insertError);
          } else {
            console.log(`✅ Produto adicionado ao estoque: ${nomeNormalizado} (${item.quantidade})\n`);
          }
        }
      } catch (error) {
        console.error('Erro ao processar item do estoque:', error);
      }
    }

    // Atualizar nota como processada
    const { error: updateError } = await supabase
      .from('notas_imagens')
      .update({
        processada: true,
        dados_extraidos: dadosExtraidos,
        updated_at: new Date().toISOString()
      })
      .eq('id', notaId);

    if (updateError) {
      console.error('Erro ao atualizar nota:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        dadosExtraidos,
        compraId: compra.id,
        itensProcessados: itensParaInserir.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Error in process-receipt-ai:', error);
    console.error('💥 Error type:', typeof error);
    console.error('💥 Error message:', error?.message);
    console.error('💥 Error stack:', error?.stack);
    
    let errorMessage = 'Erro interno do servidor';
    let statusCode = 500;
    
    if (error?.message?.includes('OPENAI_API_KEY')) {
      errorMessage = 'Chave da OpenAI não configurada';
      statusCode = 500;
    } else if (error?.message?.includes('SUPABASE')) {
      errorMessage = 'Erro de configuração do banco de dados';
      statusCode = 500;
    } else if (error?.message?.includes('notaId e imageUrl são obrigatórios')) {
      errorMessage = 'Dados da requisição inválidos';
      statusCode = 400;
    } else if (error?.message?.includes('Nota fiscal não encontrada')) {
      errorMessage = 'Nota fiscal não encontrada';
      statusCode = 404;
    } else if (error?.message?.includes('OpenAI API error')) {
      errorMessage = 'Erro na API da OpenAI - ' + error.message;
      statusCode = 500;
    } else if (error?.message?.includes('PDFs não são suportados')) {
      errorMessage = 'Arquivo PDF detectado - use uma imagem JPG';
      statusCode = 400;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage, 
        details: error?.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: statusCode, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});