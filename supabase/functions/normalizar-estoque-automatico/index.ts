import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    const { limite = 50, userId = null } = await req.json();

    console.log(`🚀 [NORMALIZAÇÃO AUTOMÁTICA] Iniciando processamento (limite: ${limite})`);

    // Buscar produtos não normalizados
    let query = supabase
      .from('estoque_app')
      .select('id, produto_nome, user_id, created_at')
      .or('produto_hash_normalizado.is.null,produto_nome_normalizado.is.null')
      .order('created_at', { ascending: false })
      .limit(limite);

    if (userId) {
      query = query.eq('user_id', userId);
      console.log(`📊 Filtrando por usuário: ${userId}`);
    }

    const { data: produtos, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar produtos:', error);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar produtos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!produtos || produtos.length === 0) {
      console.log('✅ Nenhum produto para normalizar encontrado');
      return new Response(
        JSON.stringify({ 
          success: true,
          produtos_processados: 0,
          produtos_atualizados: 0,
          message: 'Nenhum produto para normalizar encontrado'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Encontrados ${produtos.length} produtos para normalizar`);

    let processados = 0;
    let atualizados = 0;
    let erros = 0;

    // Processar produtos em paralelo com controle de concorrência
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
      const batch = produtos.slice(i, i + BATCH_SIZE);
      
      console.log(`🔄 Processando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(produtos.length/BATCH_SIZE)} (${batch.length} produtos)`);
      
      const promises = batch.map(async (produto) => {
        try {
          processados++;
          
          console.log(`🧠 [${processados}/${produtos.length}] Processando: "${produto.produto_nome}"`);

          // Chamar o Smart Product Matcher
          const { data: resultado, error: smartError } = await supabase.functions.invoke('smart-product-matcher', {
            body: { 
              produtoNome: produto.produto_nome,
              userId: produto.user_id
            }
          });

          if (smartError) {
            console.error(`❌ Erro Smart Matcher para "${produto.produto_nome}":`, smartError);
            erros++;
            return;
          }

          if (!resultado?.success) {
            console.log(`⚠️ Smart Matcher não foi bem-sucedido para "${produto.produto_nome}"`);
            erros++;
            return;
          }

          // Atualizar produto com dados normalizados
          const updateData: any = {
            produto_nome_normalizado: resultado.produto_nome_normalizado,
            produto_hash_normalizado: resultado.produto_hash_normalizado,
            updated_at: new Date().toISOString()
          };

          if (resultado.categoria) updateData.categoria = resultado.categoria;
          if (resultado.marca) updateData.marca = resultado.marca;
          if (resultado.nome_base) updateData.nome_base = resultado.nome_base;
          if (resultado.tipo_embalagem) updateData.tipo_embalagem = resultado.tipo_embalagem;
          if (resultado.qtd_valor) updateData.qtd_valor = resultado.qtd_valor;
          if (resultado.qtd_unidade) updateData.qtd_unidade = resultado.qtd_unidade;
          if (resultado.qtd_base) updateData.qtd_base = resultado.qtd_base;
          if (resultado.granel !== undefined) updateData.granel = resultado.granel;

          const { error: updateError } = await supabase
            .from('estoque_app')
            .update(updateData)
            .eq('id', produto.id);

          if (updateError) {
            console.error(`❌ Erro ao atualizar "${produto.produto_nome}":`, updateError);
            erros++;
            return;
          }

          atualizados++;

          if (resultado.tipo === 'match_encontrado') {
            console.log(`✅ [${processados}/${produtos.length}] MATCH! "${produto.produto_nome}" → "${resultado.produto_matched}"`);
          } else {
            console.log(`✅ [${processados}/${produtos.length}] NOVO! "${produto.produto_nome}" normalizado`);
          }

        } catch (error) {
          console.error(`💥 Erro geral para "${produto.produto_nome}":`, error);
          erros++;
        }
      });

      // Aguardar lote completar
      await Promise.all(promises);
      
      // Pequena pausa entre lotes para não sobrecarregar
      if (i + BATCH_SIZE < produtos.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`🎉 [NORMALIZAÇÃO AUTOMÁTICA] Concluída!`);
    console.log(`📊 Processados: ${processados} | Atualizados: ${atualizados} | Erros: ${erros}`);

    return new Response(
      JSON.stringify({
        success: true,
        produtos_processados: processados,
        produtos_atualizados: atualizados,
        produtos_com_erro: erros,
        detalhes: {
          total_encontrados: produtos.length,
          taxa_sucesso: processados > 0 ? ((atualizados / processados) * 100).toFixed(1) + '%' : '0%'
        }
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