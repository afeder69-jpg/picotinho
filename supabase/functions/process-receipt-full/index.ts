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

    // Processa produtos
    if (extractedData.produtos && Array.isArray(extractedData.produtos)) {
      for (const produtoData of extractedData.produtos) {
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
          .eq('nome', produtoData.nome)
          .single();

        if (existingProduto) {
          produto = existingProduto;
        } else {
          const { data: newProduto } = await supabase
            .from('produtos_app')
            .insert({
              nome: produtoData.nome,
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