import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, produtoNomes } = await req.json();

    if (!userId || !produtoNomes || !Array.isArray(produtoNomes)) {
      return new Response(
        JSON.stringify({ error: 'userId e produtoNomes (array) são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🧹 Iniciando limpeza de produtos específicos para usuário: ${userId}`);
    console.log(`📦 Produtos para limpar: ${produtoNomes.join(', ')}`);

    let totalDeletados = 0;
    const resultados = [];

    // 1. Deletar do estoque_app
    for (const produtoNome of produtoNomes) {
      const { data: produtosEncontrados, error: selectError } = await supabase
        .from('estoque_app')
        .select('id, produto_nome, quantidade')
        .eq('user_id', userId)
        .ilike('produto_nome', `%${produtoNome}%`);

      if (selectError) {
        console.error(`❌ Erro ao buscar produtos com nome "${produtoNome}":`, selectError);
        continue;
      }

      if (produtosEncontrados && produtosEncontrados.length > 0) {
        for (const produto of produtosEncontrados) {
          const { error: deleteError } = await supabase
            .from('estoque_app')
            .delete()
            .eq('id', produto.id);

          if (deleteError) {
            console.error(`❌ Erro ao deletar produto "${produto.produto_nome}":`, deleteError);
          } else {
            console.log(`✅ Produto deletado do estoque: ${produto.produto_nome} (ID: ${produto.id})`);
            totalDeletados++;
            resultados.push({
              acao: 'ESTOQUE_DELETADO',
              produto: produto.produto_nome,
              id: produto.id,
              quantidade: produto.quantidade
            });
          }
        }
      }
    }

    // 2. Deletar de precos_atuais_usuario
    for (const produtoNome of produtoNomes) {
      const { data: precosEncontrados, error: selectError } = await supabase
        .from('precos_atuais_usuario')
        .select('id, produto_nome, valor_unitario')
        .eq('user_id', userId)
        .ilike('produto_nome', `%${produtoNome}%`);

      if (selectError) {
        console.error(`❌ Erro ao buscar preços com nome "${produtoNome}":`, selectError);
        continue;
      }

      if (precosEncontrados && precosEncontrados.length > 0) {
        for (const preco of precosEncontrados) {
          const { error: deleteError } = await supabase
            .from('precos_atuais_usuario')
            .delete()
            .eq('id', preco.id);

          if (deleteError) {
            console.error(`❌ Erro ao deletar preço "${preco.produto_nome}":`, deleteError);
          } else {
            console.log(`✅ Preço deletado: ${preco.produto_nome} (R$ ${preco.valor_unitario})`);
            resultados.push({
              acao: 'PRECO_DELETADO',
              produto: preco.produto_nome,
              id: preco.id,
              valor: preco.valor_unitario
            });
          }
        }
      }
    }

    console.log(`✅ Limpeza concluída: ${totalDeletados} produtos removidos do estoque`);

    return new Response(
      JSON.stringify({ 
        success: true,
        totalDeletados,
        resultados,
        message: `${totalDeletados} produtos removidos com sucesso. Agora você pode reprocessar a nota.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});