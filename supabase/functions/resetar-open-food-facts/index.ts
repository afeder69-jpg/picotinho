import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    console.log('🧹 Iniciando reset do Open Food Facts...');
    
    const log: string[] = [];
    const stats = {
      stagingResetados: 0,
      mastersExcluidos: 0,
      sinonimosRemovidos: 0,
      candidatosRejeitados: 0
    };

    // 1. RESETAR STAGING ANTIGO
    console.log('📝 Passo 1: Resetando staging antigo...');
    const { data: stagingResetado, error: errorStaging } = await supabase
      .from('open_food_facts_staging')
      .update({ 
        processada: false, 
        updated_at: new Date().toISOString() 
      })
      .lt('created_at', '2025-10-05 13:00:00')
      .select('id');

    if (errorStaging) {
      console.error('Erro ao resetar staging:', errorStaging);
      throw errorStaging;
    }

    stats.stagingResetados = stagingResetado?.length || 0;
    log.push(`✅ Staging: ${stats.stagingResetados} produtos marcados para reprocessamento`);
    console.log(`✅ ${stats.stagingResetados} produtos staging resetados`);

    // 2. BUSCAR MASTERS PARA DELETAR (TODOS antes de 05/10 13:00)
    console.log('🔍 Passo 2: Identificando masters para deletar...');
    
    // Buscar IDs de masters que vieram de notas fiscais (têm candidatos auto-aprovados associados)
    const { data: candidatosAutoAprovados } = await supabase
      .from('produtos_candidatos_normalizacao')
      .select('sugestao_produto_master')
      .eq('status', 'aprovado')
      .gte('confianca_ia', 90)
      .not('sugestao_produto_master', 'is', null);
    
    const idsNotasFiscais = new Set(candidatosAutoAprovados?.map(c => c.sugestao_produto_master) || []);
    
    console.log(`ℹ️ Masters de notas fiscais auto-aprovados: ${idsNotasFiscais.size}`);
    
    // Buscar todos os masters antigos
    const { data: todosAntigos } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao')
      .eq('status', 'ativo')
      .lt('created_at', '2025-10-05 13:00:00');
    
    // Separar: masters a preservar (notas fiscais) vs masters a deletar (OFF antigos)
    const idsParaDeletar = todosAntigos?.filter(m => !idsNotasFiscais.has(m.id)).map(m => m.id) || [];
    
    console.log(`🗑️ Masters OFF antigos identificados: ${idsParaDeletar.length}`);

    // 3. LIMPAR REFERÊNCIAS DE CANDIDATOS PRIMEIRO (evitar foreign key constraint)
    console.log('🧹 Passo 3: Limpando referências de candidatos...');
    
    if (idsParaDeletar.length > 0) {
      // Atualizar candidatos que referenciam masters que serão deletados
      const { data: candidatosAtualizados, error: errorCandidatos } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({
          status: 'rejeitado',
          observacoes_revisor: 'Master OFF antigo deletado durante reset',
          sugestao_produto_master: null,
          updated_at: new Date().toISOString()
        })
        .in('sugestao_produto_master', idsParaDeletar)
        .select('id');

      if (errorCandidatos) {
        console.error('Erro ao limpar candidatos:', errorCandidatos);
        throw errorCandidatos;
      }

      stats.candidatosRejeitados = candidatosAtualizados?.length || 0;
      log.push(`🧹 Candidatos: ${stats.candidatosRejeitados} referências limpas`);
      console.log(`✅ ${stats.candidatosRejeitados} candidatos atualizados`);
    }

    // 4. DELETAR MASTERS ANTIGOS OFF
    console.log('🗑️ Passo 4: Deletando masters OFF antigos...');
    
    let mastersExcluidos: any[] = [];
    if (idsParaDeletar.length > 0) {
      const { data, error: errorMasters } = await supabase
        .from('produtos_master_global')
        .delete()
        .in('id', idsParaDeletar)
        .select('id, nome_padrao');

      if (errorMasters) {
        console.error('Erro ao deletar masters:', errorMasters);
        throw errorMasters;
      }
      
      mastersExcluidos = data || [];
    }

    stats.mastersExcluidos = mastersExcluidos?.length || 0;
    log.push(`🗑️ Masters OFF antigos: ${stats.mastersExcluidos} produtos deletados`);
    console.log(`✅ ${stats.mastersExcluidos} masters excluídos`);

    // 5. LIMPAR SINÔNIMOS ÓRFÃOS
    console.log('🧹 Passo 5: Limpando sinônimos órfãos...');
    
    // Buscar IDs de masters ativos
    const { data: mastersAtivos } = await supabase
      .from('produtos_master_global')
      .select('id')
      .eq('status', 'ativo');

    const idsAtivos = mastersAtivos?.map(m => m.id) || [];
    
    // Deletar sinônimos que apontam para masters que não existem mais
    const { data: sinonimosRemovidos, error: errorSinonimos } = await supabase
      .from('produtos_sinonimos_globais')
      .delete()
      .not('produto_master_id', 'in', `(${idsAtivos.join(',')})`)
      .select('id');

    if (errorSinonimos) {
      console.error('Erro ao limpar sinônimos:', errorSinonimos);
      log.push(`⚠️ Sinônimos: Não foi possível limpar automaticamente`);
    } else {
      stats.sinonimosRemovidos = sinonimosRemovidos?.length || 0;
      log.push(`🧹 Sinônimos órfãos: ${stats.sinonimosRemovidos} removidos`);
      console.log(`✅ ${stats.sinonimosRemovidos} sinônimos removidos`);
    }

    // Log final
    log.push('');
    log.push('🎯 RESUMO FINAL:');
    log.push(`- ${stats.stagingResetados} produtos prontos para reprocessamento via IA`);
    log.push(`- ${stats.mastersExcluidos} masters OFF antigos removidos`);
    log.push(`- ${stats.sinonimosRemovidos} sinônimos órfãos limpos`);
    log.push(`- ${stats.candidatosRejeitados} candidatos órfãos rejeitados`);
    log.push('');
    log.push('✅ Reset concluído! Clique em "Processar Novas Normalizações" para recriar os masters via IA.');

    console.log('🎉 Reset concluído com sucesso!');

    return new Response(JSON.stringify({
      success: true,
      stats,
      log
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro no reset:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      log: [`❌ Erro: ${error.message}`]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
