/**
 * 🔁 RETRY NOTAS PENDENTES
 *
 * Cron job (a cada 2 minutos) que retoma notas presas no fluxo de finalização.
 *
 * CRITÉRIOS DE ELEGIBILIDADE:
 *  - status_processamento IN ('aguardando_estoque', 'processando')
 *  - tentativas_finalizacao < 5
 *  - processing_started_at NULL OU > 3 minutos no passado
 *  - Não excluída
 *
 * AÇÃO:
 *  - Para cada nota elegível, invoca finalize-nota-estoque.
 *  - finalize-nota-estoque possui lock atômico próprio, então execuções
 *    concorrentes desta função são seguras.
 *
 * SEGURANÇA:
 *  - Limita a 20 notas por execução para evitar sobrecarga.
 *  - Invocações são paralelizadas mas com Promise.allSettled (uma falha
 *    não bloqueia as outras).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_NOTAS_POR_EXECUCAO = 20;
const MINUTOS_INATIVIDADE = 3;
// 🛡️ FRENTE A4: alinhado com LOCK_TIMEOUT_MS de process-receipt-full (90s).
const LOCK_ZOMBIE_MS = 90 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('🔁 [RETRY-CRON] Buscando notas pendentes...');

    const cutoff = new Date(Date.now() - MINUTOS_INATIVIDADE * 60 * 1000).toISOString();

    // Notas presas: status elegível, tentativas < 5, e (sem processing_started_at OU inativa há > 3min)
    const { data: notasPendentes, error: queryErr } = await supabase
      .from('notas_imagens')
      .select('id, status_processamento, tentativas_finalizacao, processing_started_at, updated_at')
      .in('status_processamento', ['aguardando_estoque', 'processando'])
      .lt('tentativas_finalizacao', 5)
      .neq('excluida', true)
      .or(`processing_started_at.is.null,processing_started_at.lt.${cutoff}`)
      .limit(MAX_NOTAS_POR_EXECUCAO);

    if (queryErr) {
      console.error('❌ [RETRY-CRON] Erro ao buscar notas:', queryErr);
      throw queryErr;
    }

    if (!notasPendentes || notasPendentes.length === 0) {
      console.log('✅ [RETRY-CRON] Nenhuma nota pendente.');
      return new Response(
        JSON.stringify({ success: true, retomadas: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`🔁 [RETRY-CRON] ${notasPendentes.length} notas elegíveis para retry`);

    // 🛡️ FRENTE A4: força liberação de "zombie locks" antes de invocar finalize.
    // process-receipt-full tem seu próprio guard, mas limpar processing_started_at
    // aqui evita que um lock antigo (>90s) bloqueie o reentry.
    const zombieCutoff = new Date(Date.now() - LOCK_ZOMBIE_MS).toISOString();
    const idsParaLiberar = notasPendentes
      .filter((n) => n.processing_started_at && n.processing_started_at < zombieCutoff)
      .map((n) => n.id);
    if (idsParaLiberar.length > 0) {
      console.log(`🔓 [RETRY-CRON] Liberando ${idsParaLiberar.length} zombie locks`);
      await supabase
        .from('notas_imagens')
        .update({ processing_started_at: null })
        .in('id', idsParaLiberar);
    }

    // Invoca finalize-nota-estoque para cada uma (lock atômico interno protege)
    const resultados = await Promise.allSettled(
      notasPendentes.map(async (nota) => {
        console.log(`  ↳ Retomando nota ${nota.id} (tentativa ${(nota.tentativas_finalizacao ?? 0) + 1}/5)`);
        return supabase.functions.invoke('finalize-nota-estoque', {
          body: { notaImagemId: nota.id },
        });
      })
    );

    const sucessos = resultados.filter((r) => r.status === 'fulfilled' && !(r.value as any).error).length;
    const falhas = resultados.length - sucessos;

    console.log(`✅ [RETRY-CRON] Concluído: ${sucessos} sucessos, ${falhas} falhas`);

    return new Response(
      JSON.stringify({
        success: true,
        retomadas: notasPendentes.length,
        sucessos,
        falhas,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('❌ [RETRY-CRON] Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
