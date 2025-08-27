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
            nome: dadosExtraidos.loja.nome || 'Supermercado Desconhecido',
            cnpj: dadosExtraidos.loja.cnpj,
            endereco: dadosExtraidos.loja.endereco || ''
          })
          .select('id')
          .single();

        if (supermercadoError) {
          console.error('Erro ao criar supermercado:', supermercadoError);
        } else {
          supermercadoId = novoSupermercado.id;
        }
      }
    }

    // Se não conseguiu encontrar/criar supermercado, criar um padrão
    if (!supermercadoId) {
      console.log('🟡 Criando supermercado padrão pois não foi possível extrair da nota');
      const { data: supermercadoPadrao, error: defaultError } = await supabase
        .from('supermercados')
        .insert({
          nome: 'Supermercado Não Identificado',
          cnpj: '00.000.000/0000-00',
          endereco: 'Endereço não informado'
        })
        .select('id')
        .single();

      if (defaultError) {
        console.error('Erro ao criar supermercado padrão:', defaultError);
        throw new Error('Não foi possível criar registro de supermercado');
      } else {
        supermercadoId = supermercadoPadrao.id;
      }
    }

    // Criar compra
    const { data: compra, error: compraError } = await supabase
      .from('compras_app')
      .insert({
        user_id: nota.usuario_id,
        supermercado_id: supermercadoId,
        data_compra: dadosExtraidos.dataCompra,
        hora_compra: dadosExtraidos.horaCompra,
        preco_total: dadosExtraidos.valorTotal,
        forma_pagamento: dadosExtraidos.formaPagamento,
        observacoes: `Processada automaticamente da nota: ${nota.nome_original || nota.id}`
      })
      .select('id')
      .single();

    if (compraError) {
      console.error('Erro ao criar compra:', compraError);
      throw new Error('Erro ao salvar compra no banco');
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