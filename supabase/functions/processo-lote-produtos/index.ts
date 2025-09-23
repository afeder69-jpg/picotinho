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

    const { produtos, userId } = await req.json();
    
    if (!produtos || !Array.isArray(produtos) || produtos.length === 0) {
      throw new Error('Lista de produtos é obrigatória');
    }

    console.log(`🚀 Processando lote de ${produtos.length} produtos para usuário ${userId}`);

    const resultados = [];
    const BATCH_SIZE = 50; // Processar em lotes menores para performance

    for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
      const lote = produtos.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(produtos.length/BATCH_SIZE)} (${lote.length} produtos)`);

      const promessasLote = lote.map(async (produto) => {
        try {
          // Chamar Smart Product Matcher para cada produto
          const { data: resultado, error } = await supabase.functions.invoke('smart-product-matcher', {
            body: { 
              produtoNome: produto.nome || produto.descricao,
              userId: userId 
            }
          });

          if (error) {
            throw error;
          }

          return {
            produtoOriginal: produto.nome || produto.descricao,
            sucesso: true,
            normalizado: resultado.produto,
            jaExistia: resultado.matched
          };

        } catch (error) {
          console.error(`❌ Erro ao processar "${produto.nome}":`, error);
          return {
            produtoOriginal: produto.nome || produto.descricao,
            sucesso: false,
            erro: error.message,
            jaExistia: false
          };
        }
      });

      // Aguardar conclusão do lote
      const resultadosLote = await Promise.all(promessasLote);
      resultados.push(...resultadosLote);

      // Pequena pausa entre lotes para não sobrecarregar
      if (i + BATCH_SIZE < produtos.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const sucessos = resultados.filter(r => r.sucesso).length;
    const erros = resultados.filter(r => !r.sucesso).length;
    const matches = resultados.filter(r => r.jaExistia).length;
    const novos = resultados.filter(r => r.sucesso && !r.jaExistia).length;

    console.log(`✅ Processamento concluído: ${sucessos} sucessos, ${erros} erros, ${matches} matches, ${novos} novos`);

    return new Response(JSON.stringify({
      success: true,
      totalProcessados: produtos.length,
      sucessos,
      erros,
      matches,
      novos,
      detalhes: resultados
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro no processamento em lote:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});