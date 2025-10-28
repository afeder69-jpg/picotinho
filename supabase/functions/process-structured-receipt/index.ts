import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Processa dados já estruturados do InfoSimples (sem usar OpenAI)
 * Atualiza estoque do usuário diretamente
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { notaImagemId, userId } = await req.json();

    if (!notaImagemId || !userId) {
      throw new Error('notaImagemId e userId são obrigatórios');
    }

    console.log('🔄 [STRUCTURED] Processando dados estruturados...');
    console.log(`   Nota ID: ${notaImagemId}`);
    console.log(`   User ID: ${userId}`);

    // 1. Buscar dados_extraidos da nota
    const { data: nota, error: notaError } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos, processada')
      .eq('id', notaImagemId)
      .single();

    if (notaError || !nota) {
      throw new Error(`Nota não encontrada: ${notaError?.message}`);
    }

    if (!nota.processada || !nota.dados_extraidos) {
      throw new Error('Nota não foi processada ainda ou dados não disponíveis');
    }

    const dadosExtraidos = nota.dados_extraidos;
    const produtos = dadosExtraidos.produtos || [];
    const emitente = dadosExtraidos.emitente || {};

    console.log(`   📦 ${produtos.length} produtos a processar`);
    console.log(`   🏪 Emitente: ${emitente.nome || 'N/A'}`);
    console.log(`   💵 Valor total: R$ ${dadosExtraidos.valor_total || 0}`);

    if (produtos.length === 0) {
      throw new Error('Nenhum produto encontrado nos dados extraídos');
    }

    // 2. Buscar ou criar estabelecimento
    let estabelecimentoId = null;

    if (emitente.cnpj) {
      const cnpjLimpo = emitente.cnpj.replace(/\D/g, '');
      
      const { data: estabExistente } = await supabase
        .from('estabelecimentos')
        .select('id')
        .eq('cnpj', cnpjLimpo)
        .single();

      if (estabExistente) {
        estabelecimentoId = estabExistente.id;
        console.log(`   ✅ Estabelecimento encontrado: ${estabelecimentoId}`);
      } else {
        const { data: novoEstab, error: estabError } = await supabase
          .from('estabelecimentos')
          .insert({
            nome: emitente.nome || 'Estabelecimento sem nome',
            cnpj: cnpjLimpo,
            tipo: 'mercado'
          })
          .select('id')
          .single();

        if (!estabError && novoEstab) {
          estabelecimentoId = novoEstab.id;
          console.log(`   ➕ Estabelecimento criado: ${estabelecimentoId}`);
        }
      }
    }

    // 3. Processar cada produto e atualizar estoque
    let produtosProcessados = 0;
    let erros = 0;

    for (const produto of produtos) {
      try {
        const nomeProduto = produto.nome || produto.descricao || 'Produto sem nome';
        const quantidade = parseFloat(produto.quantidade || 1);
        const valorUnitario = parseFloat(produto.valor_unitario || 0);
        const valorTotal = parseFloat(produto.valor_total || valorUnitario * quantidade);

        console.log(`   🔍 Processando: ${nomeProduto} (${quantidade}x R$ ${valorUnitario.toFixed(2)})`);

        // 3.1. Buscar produto_master correspondente
        const { data: produtosMaster } = await supabase
          .from('produtos_master')
          .select('id, nome_normalizado, categoria')
          .ilike('nome_normalizado', `%${nomeProduto.substring(0, 30)}%`)
          .limit(1);

        let produtoMasterId = produtosMaster?.[0]?.id;
        let categoria = produtosMaster?.[0]?.categoria || 'outros';

        // 3.2. Se não encontrou, criar novo produto_master
        if (!produtoMasterId) {
          console.log(`   ➕ Criando novo produto_master: ${nomeProduto}`);
          
          const { data: novoProdutoMaster, error: masterError } = await supabase
            .from('produtos_master')
            .insert({
              nome_normalizado: nomeProduto.toLowerCase().trim(),
              categoria: categoria,
              unidade_padrao: produto.unidade || 'UN'
            })
            .select('id')
            .single();

          if (!masterError && novoProdutoMaster) {
            produtoMasterId = novoProdutoMaster.id;
          }
        }

        // 3.3. Buscar estoque atual
        const { data: estoqueExistente } = await supabase
          .from('estoque_atual')
          .select('id, quantidade_disponivel, preco_medio')
          .eq('user_id', userId)
          .eq('produto_master_id', produtoMasterId)
          .maybeSingle();

        if (estoqueExistente) {
          // Atualizar estoque existente
          const novaQuantidade = estoqueExistente.quantidade_disponivel + quantidade;
          const precoMedioAtual = estoqueExistente.preco_medio || 0;
          const novoPrecoMedio = (precoMedioAtual + valorUnitario) / 2;

          const { error: updateError } = await supabase
            .from('estoque_atual')
            .update({
              quantidade_disponivel: novaQuantidade,
              preco_medio: novoPrecoMedio,
              ultima_atualizacao: new Date().toISOString()
            })
            .eq('id', estoqueExistente.id);

          if (updateError) {
            console.error(`   ❌ Erro ao atualizar estoque: ${updateError.message}`);
            erros++;
          } else {
            console.log(`   ✅ Estoque atualizado: ${novaQuantidade} unidades`);
            produtosProcessados++;
          }
        } else {
          // Criar novo registro de estoque
          const { error: insertError } = await supabase
            .from('estoque_atual')
            .insert({
              user_id: userId,
              produto_master_id: produtoMasterId,
              quantidade_disponivel: quantidade,
              preco_medio: valorUnitario,
              estabelecimento_id: estabelecimentoId,
              ultima_atualizacao: new Date().toISOString()
            });

          if (insertError) {
            console.error(`   ❌ Erro ao criar estoque: ${insertError.message}`);
            erros++;
          } else {
            console.log(`   ✅ Novo estoque criado: ${quantidade} unidades`);
            produtosProcessados++;
          }
        }

      } catch (error) {
        console.error(`   ❌ Erro ao processar produto:`, error);
        erros++;
      }
    }

    console.log(`\n📊 [STRUCTURED] Resumo do processamento:`);
    console.log(`   ✅ Produtos processados: ${produtosProcessados}`);
    console.log(`   ❌ Erros: ${erros}`);

    return new Response(
      JSON.stringify({
        success: true,
        produtosProcessados,
        erros,
        totalProdutos: produtos.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ [STRUCTURED] Erro:', error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: 'Erro ao processar dados estruturados'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
