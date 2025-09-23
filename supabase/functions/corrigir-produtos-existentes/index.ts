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

    const { userId, forceAll = false } = await req.json();

    console.log(`🔧 Iniciando correção de produtos existentes...`);

    let whereClause = {};
    if (userId && !forceAll) {
      whereClause = { user_id: userId };
      console.log(`👤 Corrigindo apenas para usuário: ${userId}`);
    } else {
      console.log(`🌐 Corrigindo todos os produtos (modo admin)`);
    }

    // Buscar produtos com normalizações incorretas
    const { data: produtosIncorretos, error: fetchError } = await supabase
      .from('estoque_app')
      .select('id, produto_nome, produto_nome_normalizado, categoria, user_id')
      .or(
        'categoria.eq.outros,' +
        'produto_nome_normalizado.ilike.%CHÁ MATE MATTE LEÃO%,' +
        'produto_nome_normalizado.ilike.%CREME LEITE%,' +
        'produto_nome_normalizado.is.null,' +
        'produto_hash_normalizado.is.null'
      )
      .match(whereClause);

    if (fetchError) {
      throw new Error(`Erro ao buscar produtos: ${fetchError.message}`);
    }

    console.log(`📊 Encontrados ${produtosIncorretos?.length || 0} produtos para correção`);

    let corrigidos = 0;
    let erros = 0;

    for (const produto of produtosIncorretos || []) {
      try {
        console.log(`🔧 Corrigindo: "${produto.produto_nome}"`);

        // Chamar IA-2 para renormalizar
        const { data: produtoNormalizado, error: normalizeError } = await supabase.functions.invoke('normalizar-produto-ia2', {
          body: { descricao: produto.produto_nome }
        });

        if (normalizeError) {
          console.error(`❌ Erro na normalização de "${produto.produto_nome}":`, normalizeError);
          erros++;
          continue;
        }

        // Atualizar produto com dados corretos
        const { error: updateError } = await supabase
          .from('estoque_app')
          .update({
            produto_nome_normalizado: produtoNormalizado.produto_nome_normalizado,
            nome_base: produtoNormalizado.nome_base,
            marca: produtoNormalizado.marca,
            categoria: produtoNormalizado.categoria,
            tipo_embalagem: produtoNormalizado.tipo_embalagem,
            qtd_valor: produtoNormalizado.qtd_valor,
            qtd_unidade: produtoNormalizado.qtd_unidade,
            qtd_base: produtoNormalizado.qtd_base,
            granel: produtoNormalizado.granel,
            produto_hash_normalizado: produtoNormalizado.produto_hash_normalizado,
            updated_at: new Date().toISOString()
          })
          .eq('id', produto.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar "${produto.produto_nome}":`, updateError);
          erros++;
        } else {
          corrigidos++;
          console.log(`✅ "${produto.produto_nome}" → "${produtoNormalizado.produto_nome_normalizado}" (${produtoNormalizado.categoria})`);
        }

        // Throttle para não sobrecarregar
        if (corrigidos % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`❌ Erro ao processar produto ${produto.id}:`, error);
        erros++;
      }
    }

    // Limpeza adicional: remover duplicatas
    console.log(`🧹 Iniciando limpeza de duplicatas...`);
    
    const { error: cleanupError } = await supabase.rpc('consolidar_estoque_duplicado');
    if (cleanupError) {
      console.error('❌ Erro na limpeza:', cleanupError);
    } else {
      console.log('✅ Limpeza de duplicatas concluída');
    }

    const resultado = {
      success: true,
      message: `Correção concluída: ${corrigidos} produtos corrigidos, ${erros} erros`,
      corrigidos,
      erros,
      totalProcessados: (produtosIncorretos?.length || 0)
    };

    console.log(`✅ Correção finalizada:`, resultado);

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro na correção de produtos:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});