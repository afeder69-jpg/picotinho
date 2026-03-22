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

    const { grupos } = await req.json();

    if (!grupos || !Array.isArray(grupos)) {
      throw new Error('Grupos inválidos');
    }

    console.log(`⚙️ Iniciando consolidação de ${grupos.length} grupo(s)...`);

    let totalMastersRemovidos = 0;
    let totalSinonimosGerados = 0;
    let totalReferenciasAtualizadas = 0;
    const detalhes: any[] = [];

    for (const grupo of grupos) {
      const { manter_id, remover_ids } = grupo;

      if (!manter_id || !Array.isArray(remover_ids) || remover_ids.length === 0) {
        console.warn('⚠️ Grupo inválido, pulando:', grupo);
        continue;
      }

      console.log(`\n🔄 Processando grupo:`);
      console.log(`   - Manter: ${manter_id}`);
      console.log(`   - Remover: ${remover_ids.length} produto(s)`);

      // Buscar dados do produto mantido
      const { data: produtoMantido, error: mantidoError } = await supabase
        .from('produtos_master_global')
        .select('*')
        .eq('id', manter_id)
        .single();

      if (mantidoError || !produtoMantido) {
        console.error('❌ Produto mantido não encontrado:', manter_id);
        continue;
      }

      // Buscar produtos a remover
      const { data: produtosRemover, error: removerError } = await supabase
        .from('produtos_master_global')
        .select('*')
        .in('id', remover_ids);

      if (removerError || !produtosRemover) {
        console.error('❌ Erro ao buscar produtos a remover');
        continue;
      }

      let sinonimosGrupo = 0;
      let referenciasGrupo = 0;

      // Para cada produto removido
      for (const produtoRemover of produtosRemover) {
        console.log(`\n   📦 Processando: ${produtoRemover.nome_padrao}`);

        // 1. Criar sinônimo do SKU removido -> SKU mantido
        const { error: sinonimoError } = await supabase
          .from('produtos_sinonimos_globais')
          .insert({
            produto_master_id: produtoMantido.id,
            texto_variacao: produtoRemover.sku_global,
            confianca: 1.0,
            total_ocorrencias: produtoRemover.total_notas || 1,
            origem: 'consolidacao_manual'
          });

        if (sinonimoError) {
          console.error('❌ Erro ao criar sinônimo:', sinonimoError);
        } else {
          sinonimosGrupo++;
          console.log(`      ✅ Sinônimo criado: ${produtoRemover.sku_global} → ${produtoMantido.sku_global}`);
        }

        // 2. Atualizar referências em estoque_app
        const { count: countEstoque, error: estoqueError } = await supabase
          .from('estoque_app')
          .update({
            sku_global: produtoMantido.sku_global,
            produto_master_id: produtoMantido.id
          })
          .eq('sku_global', produtoRemover.sku_global)
          .select('*', { count: 'exact', head: true });

        if (estoqueError) {
          console.error('❌ Erro ao atualizar estoque:', estoqueError);
        } else {
          referenciasGrupo += countEstoque || 0;
          console.log(`      ✅ ${countEstoque || 0} referência(s) em estoque_app`);
        }

        // 3. Atualizar referências em produtos_candidatos_normalizacao
        const { count: countCandidatos, error: candidatosError } = await supabase
          .from('produtos_candidatos_normalizacao')
          .update({
            sugestao_produto_master: produtoMantido.id,
            sugestao_sku_global: produtoMantido.sku_global
          })
          .eq('sugestao_produto_master', produtoRemover.id)
          .select('*', { count: 'exact', head: true });

        if (candidatosError) {
          console.error('❌ Erro ao atualizar candidatos:', candidatosError);
        } else {
          referenciasGrupo += countCandidatos || 0;
          console.log(`      ✅ ${countCandidatos || 0} referência(s) em candidatos`);
        }
      }

      // 4. Somar estatísticas no produto mantido
      const totalNotasRemovidas = produtosRemover.reduce((acc, p) => acc + (p.total_notas || 0), 0);
      const totalUsuariosRemovidos = produtosRemover.reduce((acc, p) => acc + (p.total_usuarios || 0), 0);

      const { error: updateError } = await supabase
        .from('produtos_master_global')
        .update({
          total_notas: (produtoMantido.total_notas || 0) + totalNotasRemovidas,
          total_usuarios: (produtoMantido.total_usuarios || 0) + totalUsuariosRemovidos
        })
        .eq('id', produtoMantido.id);

      if (updateError) {
        console.error('❌ Erro ao atualizar estatísticas:', updateError);
      } else {
        console.log(`   ✅ Estatísticas atualizadas: +${totalNotasRemovidas} notas, +${totalUsuariosRemovidos} usuários`);
      }

      // 5. Deletar produtos duplicados
      const { error: deleteError } = await supabase
        .from('produtos_master_global')
        .delete()
        .in('id', remover_ids);

      if (deleteError) {
        console.error('❌ Erro ao deletar duplicados:', deleteError);
      } else {
        totalMastersRemovidos += remover_ids.length;
        console.log(`   ✅ ${remover_ids.length} produto(s) removido(s)`);
      }

      // 6. Sincronizar estoque_app com o master mantido (via função centralizada)
      const { data: syncResult, error: syncError } = await supabase
        .rpc('sync_estoque_from_master', { p_master_id: manter_id });

      if (syncError) {
        console.error('❌ Erro ao sincronizar estoque:', syncError);
      } else {
        console.log(`   ✅ ${syncResult || 0} registro(s) de estoque sincronizado(s)`);
      }

      totalSinonimosGerados += sinonimosGrupo;
      totalReferenciasAtualizadas += referenciasGrupo;

      detalhes.push({
        mantido: produtoMantido.nome_padrao,
        mantido_sku: produtoMantido.sku_global,
        removidos: produtosRemover.map(p => p.nome_padrao),
        sinonimos_criados: sinonimosGrupo,
        referencias_atualizadas: referenciasGrupo,
        estoque_sincronizado: syncResult || 0
      });
    }

    console.log(`\n✅ Consolidação concluída:`);
    console.log(`   - ${grupos.length} grupo(s) processado(s)`);
    console.log(`   - ${totalMastersRemovidos} master(s) removido(s)`);
    console.log(`   - ${totalSinonimosGerados} sinônimo(s) criado(s)`);
    console.log(`   - ${totalReferenciasAtualizadas} referência(s) atualizada(s)`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        total_grupos_consolidados: grupos.length,
        total_masters_removidos: totalMastersRemovidos,
        total_sinonimos_criados: totalSinonimosGerados,
        total_referencias_atualizadas: totalReferenciasAtualizadas,
        detalhes
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
