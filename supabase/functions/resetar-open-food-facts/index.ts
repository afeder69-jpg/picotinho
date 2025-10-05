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

    // 2. DELETAR MASTERS ANTIGOS OFF
    console.log('🗑️ Passo 2: Deletando masters antigos OFF...');
    const { data: mastersExcluidos, error: errorMasters } = await supabase
      .from('produtos_master_global')
      .delete()
      .eq('status', 'ativo')
      .lt('created_at', '2025-10-05 13:00:00')
      .or('codigo_barras.is.null,codigo_barras.eq.')
      .select('id, nome_padrao');

    if (errorMasters) {
      console.error('Erro ao deletar masters:', errorMasters);
      throw errorMasters;
    }

    stats.mastersExcluidos = mastersExcluidos?.length || 0;
    log.push(`🗑️ Masters OFF antigos: ${stats.mastersExcluidos} produtos deletados`);
    console.log(`✅ ${stats.mastersExcluidos} masters excluídos`);

    // 3. LIMPAR SINÔNIMOS ÓRFÃOS
    console.log('🧹 Passo 3: Limpando sinônimos órfãos...');
    const { data: sinonimosRemovidos, error: errorSinonimos } = await supabase.rpc(
      'limpar_sinonimos_orfaos'
    );

    if (errorSinonimos) {
      console.error('Erro ao limpar sinônimos:', errorSinonimos);
      // Não falhar se não existir a função, continuar
      log.push(`⚠️ Sinônimos: Não foi possível limpar automaticamente`);
    } else {
      stats.sinonimosRemovidos = sinonimosRemovidos || 0;
      log.push(`🧹 Sinônimos órfãos: ${stats.sinonimosRemovidos} removidos`);
      console.log(`✅ ${stats.sinonimosRemovidos} sinônimos removidos`);
    }

    // 4. REJEITAR CANDIDATOS ÓRFÃOS
    console.log('❌ Passo 4: Rejeitando candidatos órfãos...');
    
    // Buscar IDs de masters ativos
    const { data: mastersAtivos } = await supabase
      .from('produtos_master_global')
      .select('id')
      .eq('status', 'ativo');

    const idsAtivos = mastersAtivos?.map(m => m.id) || [];

    const { data: candidatosRejeitados, error: errorCandidatos } = await supabase
      .from('produtos_candidatos_normalizacao')
      .update({
        status: 'rejeitado',
        observacoes_revisor: 'Master deletado durante limpeza OFF',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'pendente')
      .not('sugestao_produto_master', 'in', `(${idsAtivos.join(',')})`)
      .select('id');

    if (errorCandidatos) {
      console.error('Erro ao rejeitar candidatos:', errorCandidatos);
      throw errorCandidatos;
    }

    stats.candidatosRejeitados = candidatosRejeitados?.length || 0;
    log.push(`❌ Candidatos órfãos: ${stats.candidatosRejeitados} marcados como rejeitados`);
    console.log(`✅ ${stats.candidatosRejeitados} candidatos rejeitados`);

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
