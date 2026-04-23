// Backfill de EAN no catálogo master (Fase 1 — conservador)
//
// Para cada master ATIVO sem `codigo_barras`, busca os EANs mais frequentes
// entre os itens já vinculados em `estoque_app` (via produto_master_id) e,
// quando há concordância forte, grava o EAN no master.
//
// Regras de segurança:
//   - Mínimo de N itens vinculados com EAN (default 3)
//   - Concordância >= THRESHOLD (default 80%) no mesmo EAN canônico
//   - NUNCA grava se o EAN canônico já existir em outro master ativo
//     (incluindo variantes com/sem zeros à esquerda)
//   - Suporta dry_run (default true) — não escreve nada, apenas relata
//   - Apenas usuários com role 'master' podem executar
//
// Body opcional:
// {
//   "dry_run": true,                // default true
//   "limit_masters": 1000,          // teto de masters a analisar
//   "min_items": 3,                 // itens vinculados mínimos com EAN
//   "min_agreement": 0.8            // proporção de concordância no mesmo EAN
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireMaster, authErrorResponse, corsHeaders } from '../_shared/auth.ts';

interface BackfillBody {
  dry_run?: boolean;
  limit_masters?: number;
  min_items?: number;
  min_agreement?: number;
}

function canonicalEAN(ean: string | null | undefined): string | null {
  if (!ean) return null;
  const limpo = String(ean).replace(/\D/g, '').replace(/^0+/, '');
  if (!limpo || limpo.length < 7) return null;
  return limpo;
}

function eanVariants(ean: string | null | undefined): string[] {
  const canon = canonicalEAN(ean);
  if (!canon) return [];
  const set = new Set<string>([canon]);
  for (const len of [8, 12, 13, 14]) {
    if (canon.length <= len) set.add(canon.padStart(len, '0'));
  }
  return Array.from(set);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireMaster(req);
  } catch (err) {
    return authErrorResponse(err);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let body: BackfillBody = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const dryRun = body.dry_run !== false; // default true
  const limitMasters = Math.min(Math.max(body.limit_masters ?? 1000, 1), 5000);
  const minItems = Math.max(body.min_items ?? 3, 1);
  const minAgreement = Math.min(Math.max(body.min_agreement ?? 0.8, 0.5), 1.0);

  console.log(`🔧 Backfill EAN | dry_run=${dryRun} | limit=${limitMasters} | min_items=${minItems} | min_agreement=${minAgreement}`);

  // 1. Masters ativos SEM codigo_barras
  const { data: mastersSemEan, error: errMasters } = await supabase
    .from('produtos_master_global')
    .select('id, nome_padrao, sku_global')
    .eq('status', 'ativo')
    .is('codigo_barras', null)
    .limit(limitMasters);

  if (errMasters) {
    return new Response(JSON.stringify({ error: errMasters.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const totalAnalisar = mastersSemEan?.length ?? 0;
  console.log(`📊 Masters sem EAN encontrados: ${totalAnalisar}`);

  const resultados: any[] = [];
  let candidatosFortes = 0;
  let bloqueadosConflito = 0;
  let semDadosSuficientes = 0;
  let gravados = 0;

  for (const master of mastersSemEan ?? []) {
    // 2. Buscar EANs do estoque vinculados a esse master
    const { data: itens, error: errItens } = await supabase
      .from('estoque_app')
      .select('ean_comercial')
      .eq('produto_master_id', master.id)
      .not('ean_comercial', 'is', null);

    if (errItens) {
      console.warn(`⚠️ Erro lendo estoque para ${master.id}: ${errItens.message}`);
      continue;
    }

    if (!itens || itens.length < minItems) {
      semDadosSuficientes++;
      continue;
    }

    // 3. Contar EANs canônicos
    const contagem = new Map<string, number>();
    let comEanValido = 0;
    for (const it of itens) {
      const canon = canonicalEAN(it.ean_comercial);
      if (!canon) continue;
      comEanValido++;
      contagem.set(canon, (contagem.get(canon) ?? 0) + 1);
    }

    if (comEanValido < minItems) {
      semDadosSuficientes++;
      continue;
    }

    // 4. EAN mais frequente
    let eanTop: string | null = null;
    let topCount = 0;
    for (const [ean, n] of contagem) {
      if (n > topCount) { topCount = n; eanTop = ean; }
    }

    if (!eanTop) { semDadosSuficientes++; continue; }

    const acordo = topCount / comEanValido;
    if (acordo < minAgreement) {
      resultados.push({
        master_id: master.id,
        nome_padrao: master.nome_padrao,
        decisao: 'concordancia_insuficiente',
        ean_candidato: eanTop,
        concordancia: acordo,
        itens_com_ean: comEanValido,
      });
      continue;
    }

    candidatosFortes++;

    // 5. Travar contra outro master que já tenha esse EAN (em qualquer variante)
    const variantes = eanVariants(eanTop);
    const { data: conflito } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao')
      .in('codigo_barras', variantes)
      .eq('status', 'ativo')
      .neq('id', master.id)
      .limit(1);

    if (conflito && conflito.length > 0) {
      bloqueadosConflito++;
      resultados.push({
        master_id: master.id,
        nome_padrao: master.nome_padrao,
        decisao: 'bloqueado_conflito',
        ean_candidato: eanTop,
        concordancia: acordo,
        itens_com_ean: comEanValido,
        conflito_master_id: conflito[0].id,
        conflito_nome: conflito[0].nome_padrao,
      });
      continue;
    }

    // 6. Gravar (se não for dry_run)
    if (!dryRun) {
      const { error: errUpd } = await supabase
        .from('produtos_master_global')
        .update({ codigo_barras: eanTop })
        .eq('id', master.id)
        .is('codigo_barras', null); // re-check

      if (errUpd) {
        resultados.push({
          master_id: master.id,
          nome_padrao: master.nome_padrao,
          decisao: 'erro_gravacao',
          ean_candidato: eanTop,
          erro: errUpd.message,
        });
        continue;
      }
      gravados++;
    }

    resultados.push({
      master_id: master.id,
      nome_padrao: master.nome_padrao,
      decisao: dryRun ? 'gravaria' : 'gravado',
      ean_candidato: eanTop,
      concordancia: Number(acordo.toFixed(3)),
      itens_com_ean: comEanValido,
    });
  }

  const resumo = {
    dry_run: dryRun,
    total_masters_sem_ean: totalAnalisar,
    candidatos_fortes: candidatosFortes,
    bloqueados_por_conflito: bloqueadosConflito,
    sem_dados_suficientes: semDadosSuficientes,
    gravados: dryRun ? 0 : gravados,
    parametros: { min_items: minItems, min_agreement: minAgreement, limit_masters: limitMasters },
    detalhes: resultados,
  };

  console.log(`✅ Backfill EAN concluído:`, JSON.stringify({
    ...resumo,
    detalhes: `${resultados.length} entradas (omitidas no log)`,
  }));

  return new Response(JSON.stringify(resumo), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
