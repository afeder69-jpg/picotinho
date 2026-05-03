// Fase 9 — Reprocessamento de candidatos órfãos.
// Modos:
//  - modo_teste = true  → ignora kill-switch geral, lote limitado a {5,10,20} (cap 20)
//  - modo_teste = false → respeita kill-switch app_config.normalizacao_orfaos_pausado
//
// Sempre exige role master (validada por requireMaster).
// Retorna relatório detalhado para validação empírica do wrapper IA, anti-duplicata
// e masters provisórios.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

interface ReqBody {
  lote?: number;          // 5, 10 ou 20 (em modo_teste); livre 1-20 em produção
  modo_teste?: boolean;   // true = ignora kill-switch, força limite ≤20
}

const TAMANHOS_TESTE_VALIDOS = new Set([5, 10, 20]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const body: ReqBody = await req.json().catch(() => ({}));
    const modoTeste = body.modo_teste === true;

    let loteNotas = Number(body.lote) || 5;

    if (modoTeste) {
      if (!TAMANHOS_TESTE_VALIDOS.has(loteNotas)) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            error: 'Em modo_teste, lote deve ser 5, 10 ou 20.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      loteNotas = Math.max(1, Math.min(20, loteNotas));
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 🔒 KILL-SWITCH — só vale para execução AMPLA (modo_teste=false)
    if (!modoTeste) {
      const { data: cfg } = await supabase
        .from('app_config')
        .select('valor')
        .eq('chave', 'normalizacao_orfaos_pausado')
        .maybeSingle();
      const pausado = (cfg?.valor === true) || ((cfg?.valor as any) === 'true');
      if (pausado !== false) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            pausado: true,
            mensagem: 'Reprocessamento amplo está pausado. Use modo_teste=true para validação controlada.',
          }),
          { status: 423, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`🔄 [REPROCESSAR-ORFAOS] Iniciando (lote=${loteNotas} notas, modo_teste=${modoTeste})`);

    // ===== SNAPSHOT INICIAL (para diff do relatório) =====
    const tInicio = new Date().toISOString();

    const { count: errosAntes } = await supabase
      .from('ia_normalizacao_erros')
      .select('*', { count: 'exact', head: true });

    const { count: mastersProvAntes } = await supabase
      .from('produtos_master_global')
      .select('*', { count: 'exact', head: true })
      .eq('provisorio', true);

    // 1. Localizar candidatos órfãos pendentes
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
      return new Response(
        JSON.stringify({
          sucesso: true,
          modo_teste: modoTeste,
          lote_solicitado: loteNotas,
          relatorio: {
            total_orfaos: 0,
            notas_reprocessadas: 0,
            candidatos_processados: 0,
            sucessos_ia: 0,
            erros_ia_novos: 0,
            registros_ia_normalizacao_erros: errosAntes || 0,
            candidatos_bloqueados_similaridade: 0,
            novos_masters_provisorios: 0,
            permaneceram_pendentes: 0,
          },
          mensagem: 'Sem órfãos para reprocessar',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const notasIdsUnicas = Array.from(new Set(orfaos!.map(o => o.nota_imagem_id as string)));
    const notasParaProcessar = notasIdsUnicas.slice(0, loteNotas);

    // IDs dos candidatos órfãos selecionados (das notas processadas) — para diff fim-de-execução
    const candidatosNoEscopo = (orfaos || [])
      .filter(o => notasParaProcessar.includes(o.nota_imagem_id as string))
      .map(o => o.id as string);

    console.log(`📊 ${totalOrfaos} órfãos / ${notasIdsUnicas.length} notas. Lote: ${notasParaProcessar.length} notas, ${candidatosNoEscopo.length} candidatos.`);

    // 2. Forçar normalizada=false para que processar-normalizacao-global pegue
    await supabase
      .from('notas_imagens')
      .update({ normalizada: false })
      .in('id', notasParaProcessar);

    // 3. Invocar processar-normalizacao-global (1 chamada por nota)
    let totProcessados = 0, totAuto = 0, totRevisao = 0, totFalhas = 0;
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
          console.warn('⚠️ Falha interna:', resp.status, data?.error || data?.mensagem);
          continue;
        }
        totProcessados += Number(data.processados || 0);
        totAuto += Number(data.auto_aprovados || 0);
        totRevisao += Number(data.para_revisao || 0);
      } catch (e: any) {
        totFalhas++;
        console.error('❌ Erro chamada interna:', e?.message || e);
      }
    }

    // ===== RELATÓRIO PÓS-EXECUÇÃO =====
    const { count: errosDepois } = await supabase
      .from('ia_normalizacao_erros')
      .select('*', { count: 'exact', head: true });

    const errosNovos = (errosDepois || 0) - (errosAntes || 0);

    // Erros agrupados desta execução
    const { data: errosLote } = await supabase
      .from('ia_normalizacao_erros')
      .select('tipo_erro, http_status')
      .gte('criado_em', tInicio);

    const errosPorTipo: Record<string, number> = {};
    (errosLote || []).forEach(e => {
      const k = `${e.tipo_erro || 'desconhecido'}${e.http_status ? `:${e.http_status}` : ''}`;
      errosPorTipo[k] = (errosPorTipo[k] || 0) + 1;
    });

    // Status finais dos candidatos do escopo
    let bloqueadosSimilaridade = 0;
    let permaneceramPendentes = 0;
    let autoAprovadosLote = 0;
    let revisaoLote = 0;

    if (candidatosNoEscopo.length > 0) {
      const { data: statusFinal } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('id, status, motivo_bloqueio')
        .in('id', candidatosNoEscopo);

      (statusFinal || []).forEach(c => {
        if (c.status === 'pendente') permaneceramPendentes++;
        if (c.status === 'auto_aprovado') autoAprovadosLote++;
        if (c.status === 'pendente_revisao') {
          revisaoLote++;
          if (c.motivo_bloqueio) bloqueadosSimilaridade++;
        }
      });
    }

    // Novos masters provisórios criados durante a execução
    const { count: mastersProvDepois } = await supabase
      .from('produtos_master_global')
      .select('*', { count: 'exact', head: true })
      .eq('provisorio', true);

    const novosMastersProvisorios = (mastersProvDepois || 0) - (mastersProvAntes || 0);

    const sucessosIA = autoAprovadosLote + revisaoLote;

    const relatorio = {
      // escopo
      total_orfaos_disponiveis: totalOrfaos,
      notas_reprocessadas: notasParaProcessar.length,
      candidatos_no_escopo: candidatosNoEscopo.length,

      // pipeline
      candidatos_processados: totProcessados,
      sucessos_ia: sucessosIA,
      auto_aprovados: autoAprovadosLote,
      para_revisao: revisaoLote,
      candidatos_bloqueados_similaridade: bloqueadosSimilaridade,
      permaneceram_pendentes: permaneceramPendentes,

      // observabilidade IA
      erros_ia_novos: errosNovos,
      registros_ia_normalizacao_erros_total: errosDepois || 0,
      erros_por_tipo: errosPorTipo,

      // catálogo
      novos_masters_provisorios: Math.max(0, novosMastersProvisorios),

      // execução
      falhas_chamada_interna: totFalhas,
      duracao_inicio: tInicio,
      duracao_fim: new Date().toISOString(),
    };

    console.log('✅ [REPROCESSAR-ORFAOS] Relatório:', JSON.stringify(relatorio));

    return new Response(
      JSON.stringify({
        sucesso: true,
        modo_teste: modoTeste,
        lote_solicitado: loteNotas,
        relatorio,
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
