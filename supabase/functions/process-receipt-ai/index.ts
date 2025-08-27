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

    // Verificar se é um arquivo PDF
    const fileExtension = nota.imagem_url.toLowerCase().split('.').pop();
    const originalExtension = nota.nome_original?.toLowerCase().split('.').pop();
    
    console.log('🔍 Extensão do arquivo:', fileExtension);
    console.log('🔍 Nome original:', nota.nome_original);
    
    const isPDF = fileExtension === 'pdf';
    
    if (isPDF) {
      console.error('❌ PDFs não são suportados pela API de visão da OpenAI');
      throw new Error('Arquivos PDF não são suportados para extração com IA. Por favor, faça upload de uma imagem da nota fiscal (PNG, JPEG, etc.)');
    }

    // Preparar prompt para IA
    const prompt = `
Analise esta nota fiscal e extraia todas as informações estruturadas. 
Retorne APENAS um JSON válido com esta estrutura:

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

Regras importantes:
- Use apenas números para valores (sem símbolos de moeda)
- Data no formato YYYY-MM-DD
- Hora no formato HH:MM
- CNPJ formatado com pontos e barras
- Categorias comuns: laticínios, bebidas, frutas, verduras, carnes, aves, peixes, grãos, cereais, pães, doces, limpeza, higiene, outros
- Unidades comuns: UN (unidade), KG, G, L, ML, PC (peça), CX (caixa)
- Seja preciso nos valores e quantidades
- Se algum campo não estiver visível, use null
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
        max_completion_tokens: 2000,
        temperature: 0.1
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

    // NOVO: Atualizar estoque automaticamente
    console.log('📦 Atualizando estoque...');
    for (const item of dadosExtraidos.itens || []) {
      try {
        // Buscar se o produto já existe no estoque
        const { data: estoqueExistente } = await supabase
          .from('estoque_app')
          .select('*')
          .eq('user_id', nota.usuario_id)
          .eq('produto_nome', item.descricao)
          .single();

        if (estoqueExistente) {
          // Produto já existe - somar quantidade
          const novaQuantidade = parseFloat(estoqueExistente.quantidade) + parseFloat(item.quantidade || 0);
          
          await supabase
            .from('estoque_app')
            .update({
              quantidade: novaQuantidade,
              preco_unitario_ultimo: item.valorUnitario,
              updated_at: new Date().toISOString()
            })
            .eq('id', estoqueExistente.id);
            
          console.log(`✅ Estoque atualizado: ${item.descricao} (${estoqueExistente.quantidade} + ${item.quantidade} = ${novaQuantidade})`);
        } else {
          // Produto novo - criar entrada no estoque
          await supabase
            .from('estoque_app')
            .insert({
              user_id: nota.usuario_id,
              produto_nome: item.descricao,
              categoria: item.categoria || 'Outros',
              unidade_medida: item.unidadeMedida || 'UN',
              quantidade: item.quantidade || 0,
              preco_unitario_ultimo: item.valorUnitario
            });
            
          console.log(`✅ Produto adicionado ao estoque: ${item.descricao} (${item.quantidade})`);
        }
      } catch (error) {
        console.error('❌ Erro ao atualizar estoque para:', item.descricao, error);
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
      errorMessage = 'Erro na API da OpenAI';
      statusCode = 500;
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