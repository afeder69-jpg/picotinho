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

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔧 Iniciando correção automática de preços para usuário: ${userId}`);

    // 1. Buscar produtos no estoque sem preço ou com preço zerado
    const { data: produtosSemPreco, error: errorEstoque } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId)
      .or('preco_unitario_ultimo.is.null,preco_unitario_ultimo.eq.0')
      .gt('quantidade', 0);

    if (errorEstoque) {
      console.error('❌ Erro ao buscar produtos sem preço:', errorEstoque);
      throw errorEstoque;
    }

    console.log(`📦 Encontrados ${produtosSemPreco?.length || 0} produtos sem preço`);

    let produtosCorrigidos = 0;
    let erros = 0;

    if (produtosSemPreco && produtosSemPreco.length > 0) {
      // 2. Para cada produto sem preço, buscar nas notas fiscais do usuário
      for (const produto of produtosSemPreco) {
        try {
          // Buscar preço nas notas fiscais processadas
          const { data: notasComProduto, error: errorNotas } = await supabase
            .from('notas_imagens')
            .select('dados_extraidos')
            .eq('usuario_id', userId)
            .eq('processada', true)
            .not('dados_extraidos', 'is', null);

          if (errorNotas) {
            console.error(`❌ Erro ao buscar notas para ${produto.produto_nome}:`, errorNotas);
            erros++;
            continue;
          }

          let precoEncontrado = null;

          // Procurar o produto nas notas fiscais
          for (const nota of (notasComProduto || [])) {
            const dadosExtraidos = nota.dados_extraidos as any;
            
            if (dadosExtraidos && dadosExtraidos.itens) {
              for (const item of dadosExtraidos.itens) {
                const nomeItem = (item.descricao || item.nome || '').toUpperCase().trim();
                const nomeProduto = produto.produto_nome.toUpperCase().trim();
                
                // Verificar se é o mesmo produto
                if (nomeItem === nomeProduto || 
                    nomeItem.includes(nomeProduto) || 
                    nomeProduto.includes(nomeItem)) {
                  
                  const valorUnitario = parseFloat(item.valor_unitario || item.preco_unitario || 0);
                  
                  if (valorUnitario > 0) {
                    precoEncontrado = valorUnitario;
                    console.log(`💰 Preço encontrado para ${produto.produto_nome}: R$ ${valorUnitario}`);
                    break;
                  }
                }
              }
              
              if (precoEncontrado) break;
            }
          }

          // Se encontrou preço, atualizar o produto
          if (precoEncontrado) {
            const { error: errorUpdate } = await supabase
              .from('estoque_app')
              .update({
                preco_unitario_ultimo: precoEncontrado,
                updated_at: new Date().toISOString()
              })
              .eq('id', produto.id);

            if (errorUpdate) {
              console.error(`❌ Erro ao atualizar preço de ${produto.produto_nome}:`, errorUpdate);
              erros++;
            } else {
              produtosCorrigidos++;
              console.log(`✅ Preço corrigido: ${produto.produto_nome} -> R$ ${precoEncontrado}`);
            }
          } else {
            console.log(`⚠️ Nenhum preço encontrado para: ${produto.produto_nome}`);
          }

        } catch (error) {
          console.error(`❌ Erro ao processar produto ${produto.produto_nome}:`, error);
          erros++;
        }
      }
    }

    console.log(`✅ Correção automática concluída: ${produtosCorrigidos} produtos corrigidos, ${erros} erros`);

    return new Response(
      JSON.stringify({ 
        success: true,
        produtosCorrigidos,
        erros,
        message: `Correção automática concluída: ${produtosCorrigidos} produtos corrigidos`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});