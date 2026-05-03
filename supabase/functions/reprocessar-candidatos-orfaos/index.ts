// Fase 9 — Reprocessamento de candidatos órfãos (placeholders sem IA).
// Reutiliza 100% do pipeline em processar-normalizacao-global.
//
// Estratégia: agrupa candidatos órfãos por nota_imagem_id, força normalizada=false
// nessas notas e invoca processar-normalizacao-global em lotes. O pipeline corrigido
// (Fase 1) detecta os órfãos via flag precisa_ia e roda a IA neles.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

interface ReqBody {
  lote?: number; // default 5 notas por execução
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const body: ReqBody = await req.json().catch(() => ({}));
    const loteNotas = Math.max(1, Math.min(20, Number(body.lote) || 5));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🔄 [REPROCESSAR-ORFAOS] Iniciando (lote=${loteNotas} notas)`);

    // 1. Localizar notas que têm candidatos órfãos
    const { data: orfaos, error: orfaosErr } = await supabase
      .from('produtos_candidatos_normalizacao')
      .select('id, nota_imagem_id')
      .eq('status', 'pendente')
      .eq('precisa_ia', true)
      .not('nota_imagem_id', 'is', null)
      .limit(500);

    if (orfaosErr) throw orfaosErr;

    const totalOrfaos = orfaos?.length || 0;
    if (totalOrfaos === 0) {
      console.log('ℹ️ Nenhum candidato órfão encontrado.');
      return new Response(
        JSON.stringify({
          sucesso: true,
          total_orfaos: 0,
          notas_reprocessadas: 0,
          processados: 0,
          auto_aprovados: 0,
          para_revisao: 0,
          mensagem: 'Sem órfãos para reprocessar'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const notasIdsUnicas = Array.from(new Set(orfaos!.map(o => o.nota_imagem_id as string)));
    const notasParaProcessar = notasIdsUnicas.slice(0, loteNotas);

    console.log(`📊 ${totalOrfaos} órfãos em ${notasIdsUnicas.length} notas. Processando ${notasParaProcessar.length} nesta execução.`);

    // 2. Forçar normalizada=false nessas notas para que processar-normalizacao-global as pegue
    const { error: rebackErr } = await supabase
      .from('notas_imagens')
      .update({ normalizada: false })
      .in('id', notasParaProcessar);

    if (rebackErr) {
      console.error('⚠️ Falha ao resetar flag normalizada:', rebackErr.message);
    }

    // 3. Invocar processar-normalizacao-global encadeadamente (1 chamada por nota)
    let totProcessados = 0, totAuto = 0, totRevisao = 0, totFalhas = 0;

    // Repassar o Authorization do master que invocou para a edge interna
    const authHeader = req.headers.get('Authorization') || '';

    for (const _ of notasParaProcessar) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/processar-normalizacao-global`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({}),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.sucesso === false) {
          totFalhas++;
          console.warn('⚠️ Falha na chamada interna:', resp.status, data?.error || data?.mensagem);
          continue;
        }
        totProcessados += Number(data.processados || 0);
        totAuto += Number(data.auto_aprovados || 0);
        totRevisao += Number(data.para_revisao || 0);
      } catch (e: any) {
        totFalhas++;
        console.error('❌ Erro chamando processar-normalizacao-global:', e?.message || e);
      }
    }

    console.log(`✅ [REPROCESSAR-ORFAOS] Concluído: ${totProcessados} processados, ${totAuto} auto, ${totRevisao} revisão, ${totFalhas} falhas`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        total_orfaos: totalOrfaos,
        notas_reprocessadas: notasParaProcessar.length,
        processados: totProcessados,
        auto_aprovados: totAuto,
        para_revisao: totRevisao,
        falhas: totFalhas,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ sucesso: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
