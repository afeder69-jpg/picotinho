// Fase 3 — Vincular itens órfãos do estoque por EAN ao master correspondente
//
// Para cada item de estoque_app com produto_master_id IS NULL e ean_comercial válido,
// procura no catálogo master_global um master ATIVO único cujo codigo_barras case
// pelo EAN canônico (cobrindo variantes com/sem zeros à esquerda).
// Quando match único, propaga: produto_master_id, sku_global, produto_nome (= nome_padrao),
// produto_nome_normalizado, marca, categoria, imagem_url e nome_base.
//
// Regras:
//   - dry_run (default TRUE) — só relata, não altera
//   - Match deve ser único (length === 1) — masters duplicados são pulados
//   - Apenas masters com status='ativo'
//   - Apenas role 'master' pode executar
//
// Body opcional:
// {
//   "dry_run": true,
//   "limit": 5000        // teto de itens a processar
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireMaster, authErrorResponse, corsHeaders } from '../_shared/auth.ts';

interface Body {
  dry_run?: boolean;
  limit?: number;
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

  let body: Body = {};
  try { body = await req.json(); } catch (_) { body = {}; }

  const dryRun = body.dry_run !== false;
  const limit = Math.min(Math.max(body.limit ?? 5000, 1), 20000);

  console.log(`🔗 Vincular órfãos por EAN | dry_run=${dryRun} | limit=${limit}`);

  // 1. Itens de estoque sem master_id, com EAN válido
  const { data: orfaos, error: errOrf } = await supabase
    .from('estoque_app')
    .select('id, user_id, produto_nome, ean_comercial')
    .is('produto_master_id', null)
    .not('ean_comercial', 'is', null)
    .limit(limit);

  if (errOrf) {
    return new Response(JSON.stringify({ error: errOrf.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const total = orfaos?.length ?? 0;
  console.log(`📊 Órfãos com EAN encontrados: ${total}`);

  const detalhes: any[] = [];
  let vinculaveis = 0;
  let semMatch = 0;
  let ambiguosPulados = 0;
  let eanInvalido = 0;
  let aplicados = 0;

  for (const item of orfaos ?? []) {
    const variantes = eanVariants(item.ean_comercial);
    if (variantes.length === 0) {
      eanInvalido++;
      continue;
    }

    const { data: mastersRaw, error: errM } = await supabase
      .from('produtos_master_global')
      .select('id, sku_global, nome_padrao, nome_base, marca, categoria, imagem_url')
      .in('codigo_barras', variantes)
      .eq('status', 'ativo')
      .limit(5);

    if (errM) {
      detalhes.push({ estoque_id: item.id, decisao: 'erro_lookup', erro: errM.message });
      continue;
    }

    const masters = mastersRaw
      ? Array.from(new Map(mastersRaw.map((m: any) => [m.id, m])).values())
      : [];

    if (masters.length === 0) { semMatch++; continue; }
    if (masters.length > 1) {
      ambiguosPulados++;
      detalhes.push({
        estoque_id: item.id,
        produto_nome: item.produto_nome,
        ean: item.ean_comercial,
        decisao: 'ambiguo_pulado',
        master_ids: masters.map((m: any) => m.id),
      });
      continue;
    }

    const master = masters[0] as any;
    vinculaveis++;

    const update = {
      produto_master_id: master.id,
      sku_global: master.sku_global,
      produto_nome: master.nome_padrao,
      produto_nome_normalizado: master.nome_padrao,
      nome_base: master.nome_base,
      marca: master.marca,
      categoria: (master.categoria || 'OUTROS').toLowerCase(),
      imagem_url: master.imagem_url,
    };

    if (!dryRun) {
      const { error: errUpd } = await supabase
        .from('estoque_app')
        .update(update)
        .eq('id', item.id)
        .is('produto_master_id', null);

      if (errUpd) {
        detalhes.push({ estoque_id: item.id, decisao: 'erro_update', erro: errUpd.message });
        continue;
      }
      aplicados++;
    }

    detalhes.push({
      estoque_id: item.id,
      produto_nome_antes: item.produto_nome,
      produto_nome_depois: master.nome_padrao,
      ean: item.ean_comercial,
      master_id: master.id,
      decisao: dryRun ? 'vincularia' : 'vinculado',
    });
  }

  const resumo = {
    dry_run: dryRun,
    total_orfaos_com_ean: total,
    vinculaveis,
    sem_match_no_master: semMatch,
    ambiguos_pulados: ambiguosPulados,
    ean_invalido: eanInvalido,
    aplicados: dryRun ? 0 : aplicados,
    detalhes,
  };

  console.log(`✅ Vincular órfãos concluído:`, JSON.stringify({
    ...resumo,
    detalhes: `${detalhes.length} entradas (omitidas no log)`,
  }));

  return new Response(JSON.stringify(resumo), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
