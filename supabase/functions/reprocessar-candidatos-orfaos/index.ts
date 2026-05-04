// Fase 9 — Reprocessamento de candidatos órfãos.
// Modos:
//  - modo_teste = true  → ignora kill-switch; lote = nº REAL de candidatos (5/10/20)
//  - modo_teste = false → respeita kill-switch app_config.normalizacao_orfaos_pausado
//
// Em modo_teste, propaga `limite_candidatos` para processar-normalizacao-global
// para garantir 1 ciclo único e execução abaixo de ~30s.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

interface ReqBody {
  lote?: number;          // EM MODO TESTE: nº de CANDIDATOS (5/10/20). EM PRODUÇÃO: nº de notas.
  modo_teste?: boolean;
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
    let lote = Number(body.lote) || 5;

    if (modoTeste) {
      if (!TAMANHOS_TESTE_VALIDOS.has(lote)) {
        return new Response(
          JSON.stringify({ sucesso: false, error: 'Em modo_teste, lote deve ser 5, 10 ou 20 (candidatos).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      lote = Math.max(1, Math.min(20, lote));
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const debugTrace: string[] = [];
    const pushDebug = (mensagem: string, dados?: Record<string, unknown>) => {
      const linha = dados ? `${mensagem} ${JSON.stringify(dados)}` : mensagem;
      debugTrace.push(linha);
      console.log(linha);
    };
    const debugInfo: Record<string, unknown> = {
      modo_teste: modoTeste,
      lote_solicitado: lote,
      elegiveis_encontrados: 0,
      candidatos_selecionados: 0,
      notas_selecionadas: 0,
      candidato_ids_enviados: [],
      payload_interno: null,
      resposta_interna: null,
    };

    // 🔒 KILL-SWITCH só vale para execução AMPLA
    if (!modoTeste) {
      const { data: cfg } = await supabase
        .from('app_config').select('valor').eq('chave', 'normalizacao_orfaos_pausado').maybeSingle();
      const pausado = (cfg?.valor === true) || ((cfg?.valor as any) === 'true');
      if (pausado !== false) {
        return new Response(
          JSON.stringify({ sucesso: false, pausado: true, mensagem: 'Reprocessamento amplo pausado. Use modo_teste=true.' }),
          { status: 423, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    pushDebug('🔄 [REPROCESSAR-ORFAOS] início', { modo_teste: modoTeste, lote });

    // ===== SNAPSHOT INICIAL =====
    const tInicio = new Date().toISOString();
    const { count: errosAntes } = await supabase
      .from('ia_normalizacao_erros').select('*', { count: 'exact', head: true });
    const { count: mastersProvAntes } = await supabase
      .from('produtos_master_global').select('*', { count: 'exact', head: true }).eq('provisorio', true);

    // 1. Localizar candidatos ELEGÍVEIS (filtro estrito)
    //    status='pendente' AND precisa_ia=true AND motivo_bloqueio IS NULL
    const { count: totalElegiveis, error: countErr } = await supabase
      .from('produtos_candidatos_normalizacao')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente')
      .eq('precisa_ia', true)
      .is('motivo_bloqueio', null)
      .not('nota_imagem_id', 'is', null);
    if (countErr) throw countErr;

    debugInfo.elegiveis_encontrados = totalElegiveis ?? 0;
    pushDebug('📊 Total de candidatos elegíveis (Aguardando IA)', { total: totalElegiveis ?? 0 });

    if (!totalElegiveis || totalElegiveis === 0) {
      return new Response(
        JSON.stringify({
          sucesso: true,
          modo_teste: modoTeste,
          lote_solicitado: lote,
          relatorio: {
            total_elegiveis: 0,
            candidatos_no_escopo: 0,
            mensagem: 'Nenhum candidato elegível para processamento',
          },
          debug: {
            reprocessar: debugInfo,
            trace: debugTrace,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Em MODO TESTE: pegar EXATAMENTE N candidatos elegíveis (não notas)
    // Em produção: pegar até 500 elegíveis e agrupar por nota
    const limiteSelecao = modoTeste ? lote : 500;
    const { data: orfaos, error: orfaosErr } = await supabase
      .from('produtos_candidatos_normalizacao')
      .select('id, nota_imagem_id')
      .eq('status', 'pendente')
      .eq('precisa_ia', true)
      .is('motivo_bloqueio', null)
      .not('nota_imagem_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(limiteSelecao);
    if (orfaosErr) throw orfaosErr;

    const candidatosNoEscopo: string[] = (orfaos || []).map(o => o.id as string);
    const notasParaProcessar: string[] = Array.from(new Set((orfaos || []).map(o => o.nota_imagem_id as string)));

    // Validação: garantir alinhamento entre solicitado e selecionado
    if (modoTeste && candidatosNoEscopo.length < lote) {
      pushDebug('ℹ️ Menos elegíveis do que o lote solicitado', {
        lote_solicitado: lote,
        candidatos_encontrados: candidatosNoEscopo.length,
      });
    }

    // Em produção, limitar pelo nº de notas (compatibilidade com kill-switch amplo)
    let limiteCandidatosParaInterna: number | null = modoTeste ? lote : null;
    let candidatoIdsParaInterna = candidatosNoEscopo;
    let notasFinaisParaProcessar = notasParaProcessar;

    if (!modoTeste) {
      notasFinaisParaProcessar = notasParaProcessar.slice(0, lote);
      candidatoIdsParaInterna = (orfaos || [])
        .filter(o => notasFinaisParaProcessar.includes(o.nota_imagem_id as string))
        .map(o => o.id as string);
    }

    debugInfo.candidatos_selecionados = candidatoIdsParaInterna.length;
    debugInfo.notas_selecionadas = notasFinaisParaProcessar.length;
    debugInfo.candidato_ids_enviados = candidatoIdsParaInterna;
    pushDebug('📊 Escopo selecionado para processamento', {
      total_elegiveis: totalElegiveis ?? 0,
      candidatos_no_escopo: candidatoIdsParaInterna.length,
      notas_no_escopo: notasFinaisParaProcessar.length,
      cap_interna: limiteCandidatosParaInterna,
      candidato_ids: candidatoIdsParaInterna,
    });

    // 2. Forçar normalizada=false p/ que processar-normalizacao-global aceite as notas
    //    (em modo candidatos diretos a interna ignora a varredura por nota, mas mantemos por compat)
    if (notasFinaisParaProcessar.length > 0) {
      await supabase.from('notas_imagens').update({ normalizada: false }).in('id', notasFinaisParaProcessar);
    }

    // 3. Em MODO TESTE: 1 chamada única à interna passando candidato_ids EXATOS.
    //    Em produção: 1 chamada por nota com candidato_ids daquela nota.
    let totProcessados = 0, totAuto = 0, totRevisao = 0, totFalhas = 0, totTruncados = 0;
    const authHeader = req.headers.get('Authorization') || '';

    const chamarInterna = async (payload: any) => {
      try {
        debugInfo.payload_interno = payload;
        pushDebug('📤 Chamando processar-normalizacao-global', payload);
        const resp = await fetch(`${supabaseUrl}/functions/v1/processar-normalizacao-global`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        debugInfo.resposta_interna = { status_http: resp.status, body: data };
        pushDebug('📥 Resposta de processar-normalizacao-global', {
          status_http: resp.status,
          processados: data?.processados ?? null,
          auto_aprovados: data?.auto_aprovados ?? null,
          para_revisao: data?.para_revisao ?? null,
          debug_presente: !!data?.debug,
        });
        if (!resp.ok || data?.sucesso === false) {
          totFalhas++;
          console.warn('⚠️ Falha interna:', resp.status, data?.error || data?.mensagem);
          return;
        }
        totProcessados += Number(data.processados || 0);
        totAuto += Number(data.auto_aprovados || 0);
        totRevisao += Number(data.para_revisao || 0);
        totTruncados += Number(data.candidatos_truncados_por_cap || 0);
      } catch (e: any) {
        totFalhas++;
        console.error('❌ Erro chamada interna:', e?.message || e);
      }
    };

    if (modoTeste) {
      await chamarInterna({
        modo_teste: true,
        limite_candidatos: limiteCandidatosParaInterna,
        limite_notas: Math.min(5, notasFinaisParaProcessar.length),
        candidato_ids: candidatoIdsParaInterna,
      });
    } else {
      for (const notaId of notasFinaisParaProcessar) {
        const idsDaNota = (orfaos || [])
          .filter(o => o.nota_imagem_id === notaId)
          .map(o => o.id as string);
        await chamarInterna({ candidato_ids: idsDaNota });
      }
    }

    // ===== RELATÓRIO =====
    const { count: errosDepois } = await supabase
      .from('ia_normalizacao_erros').select('*', { count: 'exact', head: true });
    const errosNovos = (errosDepois || 0) - (errosAntes || 0);

    const { data: errosLote } = await supabase
      .from('ia_normalizacao_erros').select('tipo_erro, http_status').gte('criado_em', tInicio);
    const errosPorTipo: Record<string, number> = {};
    (errosLote || []).forEach(e => {
      const k = `${e.tipo_erro || 'desconhecido'}${e.http_status ? `:${e.http_status}` : ''}`;
      errosPorTipo[k] = (errosPorTipo[k] || 0) + 1;
    });

    let bloqueadosSimilaridade = 0, permaneceramPendentes = 0, autoAprovadosLote = 0, revisaoLote = 0;
    if (candidatoIdsParaInterna.length > 0) {
      const { data: statusFinal } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('id, status, motivo_bloqueio')
        .in('id', candidatoIdsParaInterna);
      (statusFinal || []).forEach(c => {
        if (c.status === 'pendente') permaneceramPendentes++;
        if (c.status === 'auto_aprovado') autoAprovadosLote++;
        if (c.status === 'pendente_revisao') {
          revisaoLote++;
          if (c.motivo_bloqueio) bloqueadosSimilaridade++;
        }
      });
    }

    const { count: mastersProvDepois } = await supabase
      .from('produtos_master_global').select('*', { count: 'exact', head: true }).eq('provisorio', true);
    const novosMastersProvisorios = Math.max(0, (mastersProvDepois || 0) - (mastersProvAntes || 0));

    const relatorio = {
      total_elegiveis: totalElegiveis ?? 0,
      candidatos_no_escopo: candidatoIdsParaInterna.length,
      notas_envolvidas: notasFinaisParaProcessar.length,
      cap_candidatos_aplicado: limiteCandidatosParaInterna,
      candidatos_truncados_por_cap: totTruncados,

      candidatos_processados: totProcessados,
      sucessos_ia: autoAprovadosLote + revisaoLote,
      auto_aprovados: autoAprovadosLote,
      para_revisao: revisaoLote,
      candidatos_bloqueados_similaridade: bloqueadosSimilaridade,
      permaneceram_pendentes: permaneceramPendentes,

      erros_ia_novos: errosNovos,
      registros_ia_normalizacao_erros_total: errosDepois || 0,
      erros_por_tipo: errosPorTipo,

      novos_masters_provisorios: novosMastersProvisorios,

      falhas_chamada_interna: totFalhas,
      duracao_inicio: tInicio,
      duracao_fim: new Date().toISOString(),
    };

    pushDebug('✅ Relatório final do reprocessamento', relatorio as unknown as Record<string, unknown>);

    return new Response(
      JSON.stringify({
        sucesso: true,
        modo_teste: modoTeste,
        lote_solicitado: lote,
        relatorio,
        debug: {
          reprocessar: debugInfo,
          trace: debugTrace,
          processar_normalizacao_global: (debugInfo.resposta_interna as any)?.body?.debug ?? null,
        },
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
