// Edge Function: auditar-precos-contaminados
// SOMENTE LEITURA. Não deleta, não atualiza, não insere em precos_atuais.
// Classifica cada registro de precos_atuais como 'legitimo' ou 'suspeito'
// com base em correspondência real em notas_imagens.dados_extraidos.itens.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOLERANCIA_VALOR = 0.05;
const JANELA_DIAS = 2; // ±2 dias para buscar nota de origem

function normalizeStr(s: any): string {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(s: any): string {
  return String(s || "").replace(/\D/g, "");
}

interface ItemNota {
  ean: string;
  desc: string;
  valor: number;
  qtd: number;
}

function extrairItens(dados: any): ItemNota[] {
  const itens = (dados && (dados.itens || dados.produtos)) || [];
  if (!Array.isArray(itens)) return [];
  return itens.map((it: any) => ({
    ean: String(it.ean || it.codigo_barras || it.codigo || "").trim(),
    desc: normalizeStr(it.descricao || it.nome || ""),
    valor: Number(it.valor_unitario ?? it.preco_unitario ?? 0),
    qtd: Number(it.quantidade ?? 0),
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let jobId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const pageSize: number = Math.min(Number(body.pageSize) || 500, 1000);
    const maxPages: number = Number(body.maxPages) || 1000;
    const resumeJobId: string | null = body.resume_job_id || null;
    const startOffset: number = Number(body.start_offset) || 0;

    if (resumeJobId) {
      jobId = resumeJobId;
      await supabase
        .from("precos_atuais_auditoria_jobs")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      console.log(`[auditoria] retomando job id=${jobId} offset=${startOffset}`);
    } else {
      const { data: job, error: jobErr } = await supabase
        .from("precos_atuais_auditoria_jobs")
        .insert({
          status: "running",
          parametros: { pageSize, maxPages, janela_dias: JANELA_DIAS },
        })
        .select("id")
        .single();

      if (jobErr || !job) {
        throw new Error(`falha ao criar job: ${jobErr?.message}`);
      }
      jobId = job.id as string;
      console.log(`[auditoria] job iniciado id=${jobId}`);
    }

    const runBackground = async () => {
      try {
        await executarAuditoria(supabase, jobId!, pageSize, maxPages, startOffset);
      } catch (e: any) {
        console.error("[auditoria] erro background:", e?.message || e);
        await supabase
          .from("precos_atuais_auditoria_jobs")
          .update({
            status: "error",
            erro: String(e?.message || e),
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId!);
      }
    };

    // @ts-ignore EdgeRuntime is available at runtime
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runBackground());
    } else {
      runBackground();
    }

    return new Response(
      JSON.stringify({ ok: true, job_id: jobId, status: "running" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[auditoria] erro fatal:", err?.message || err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err), job_id: jobId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function executarAuditoria(
  supabase: any,
  jobId: string,
  pageSize: number,
  maxPages: number,
  startOffset: number = 0,
) {
  // 1. Pré-computar replicação cruzada (cnpj+valor+data → distintos master_ids)
  const replicacaoMap = new Map<string, Set<string>>();
  {
    let from = 0;
    while (true) {
      const to = from + pageSize - 1;
      const { data: chunk } = await supabase
        .from("precos_atuais")
        .select("estabelecimento_cnpj, valor_unitario, data_atualizacao, produto_master_id")
        .range(from, to);
      if (!chunk || chunk.length === 0) break;
      for (const r of chunk) {
        if (!r.produto_master_id) continue;
        const dia = String(r.data_atualizacao || "").slice(0, 10);
        const key = `${onlyDigits(r.estabelecimento_cnpj)}|${Number(r.valor_unitario).toFixed(2)}|${dia}`;
        if (!replicacaoMap.has(key)) replicacaoMap.set(key, new Set());
        replicacaoMap.get(key)!.add(r.produto_master_id);
      }
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
  }
  console.log(`[auditoria] mapa de replicação: ${replicacaoMap.size} chaves`);

  // 2. Cache de notas por (cnpj, janela)
  const notasCache = new Map<string, any[]>();
  async function getNotasCandidatas(cnpj: string, dataRef: string) {
    const cnpjN = onlyDigits(cnpj);
    const ref = new Date(dataRef);
    const ini = new Date(ref);
    ini.setDate(ref.getDate() - JANELA_DIAS);
    const fim = new Date(ref);
    fim.setDate(ref.getDate() + JANELA_DIAS);
    const cacheKey = `${cnpjN}|${ini.toISOString().slice(0, 10)}|${fim.toISOString().slice(0, 10)}`;
    if (notasCache.has(cacheKey)) return notasCache.get(cacheKey)!;

    const { data: notas } = await supabase
      .from("notas_imagens")
      .select("id, dados_extraidos, data_criacao")
      .gte("data_criacao", ini.toISOString())
      .lte("data_criacao", fim.toISOString())
      .eq("excluida", false);

    const filtradas = (notas || []).filter((n: any) => {
      const cnpjNota = onlyDigits(
        n?.dados_extraidos?.estabelecimento?.cnpj ||
          n?.dados_extraidos?.cnpj ||
          n?.dados_extraidos?.emitente?.cnpj ||
          "",
      );
      return cnpjNota && cnpjNota === cnpjN;
    });

    notasCache.set(cacheKey, filtradas);
    return filtradas;
  }

  const totals = {
    analisados: 0,
    legitimos: 0,
    suspeitos: 0,
    nota_nao_encontrada: 0,
    nota_sem_item: 0,
    master_invalido: 0,
    replicacao_cruzada: 0,
  };

  let from = 0;
  let page = 0;
  while (page < maxPages) {
    const to = from + pageSize - 1;
    const { data: precos, error: precosErr } = await supabase
      .from("precos_atuais")
      .select(
        "id, produto_master_id, produto_nome, estabelecimento_cnpj, estabelecimento_nome, valor_unitario, data_atualizacao, user_id",
      )
      .order("data_atualizacao", { ascending: false })
      .range(from, to);

    if (precosErr) throw precosErr;
    if (!precos || precos.length === 0) break;

    const auditoriaRows: any[] = [];

    for (const p of precos) {
      totals.analisados++;
      const cnpjN = onlyDigits(p.estabelecimento_cnpj);
      const dataRef = p.data_atualizacao || new Date().toISOString();
      const dia = String(dataRef).slice(0, 10);
      const repKey = `${cnpjN}|${Number(p.valor_unitario).toFixed(2)}|${dia}`;
      const replicacaoCount = replicacaoMap.get(repKey)?.size || 0;
      if (replicacaoCount >= 3) totals.replicacao_cruzada++;

      // (A) master inválido
      if (!p.produto_master_id) {
        totals.suspeitos++;
        totals.master_invalido++;
        auditoriaRows.push({
          job_id: jobId,
          preco_atual_id: p.id,
          produto_master_id: null,
          produto_nome: p.produto_nome,
          estabelecimento_cnpj: cnpjN,
          estabelecimento_nome: p.estabelecimento_nome,
          valor_unitario: p.valor_unitario,
          data_atualizacao: p.data_atualizacao,
          user_id: p.user_id,
          classificacao: "suspeito",
          motivo: "master_invalido",
          replicacao_count: replicacaoCount,
          evidencia: { repKey },
        });
        continue;
      }

      // EAN do master
      const { data: master } = await supabase
        .from("produtos_master_global")
        .select("codigo_barras")
        .eq("id", p.produto_master_id)
        .maybeSingle();
      const eanMaster = String(master?.codigo_barras || "").trim();

      const notas = await getNotasCandidatas(cnpjN, dataRef);
      if (!notas || notas.length === 0) {
        totals.suspeitos++;
        totals.nota_nao_encontrada++;
        auditoriaRows.push({
          job_id: jobId,
          preco_atual_id: p.id,
          produto_master_id: p.produto_master_id,
          produto_nome: p.produto_nome,
          estabelecimento_cnpj: cnpjN,
          estabelecimento_nome: p.estabelecimento_nome,
          valor_unitario: p.valor_unitario,
          data_atualizacao: p.data_atualizacao,
          user_id: p.user_id,
          classificacao: "suspeito",
          motivo: "nota_nao_encontrada",
          replicacao_count: replicacaoCount,
          evidencia: { janela_dias: JANELA_DIAS },
        });
        continue;
      }

      const valorAlvo = Number(p.valor_unitario);
      const descAlvo = normalizeStr(p.produto_nome);
      let match: { nota_id: string; item: ItemNota; criterio: string } | null = null;

      outer: for (const n of notas) {
        const itens = extrairItens(n.dados_extraidos);
        // (B) match por EAN forte (somente quando há EAN no master)
        if (eanMaster && eanMaster.length >= 8) {
          for (const it of itens) {
            if (
              it.ean &&
              it.ean === eanMaster &&
              Math.abs(it.valor - valorAlvo) <= TOLERANCIA_VALOR
            ) {
              match = { nota_id: n.id, item: it, criterio: "ean" };
              break outer;
            }
          }
        }
        // (C) fallback: descrição EXATA + valor — apenas se não houver match por EAN
        if (!match && (!eanMaster || eanMaster.length < 8)) {
          for (const it of itens) {
            if (
              descAlvo &&
              it.desc &&
              descAlvo === it.desc &&
              Math.abs(it.valor - valorAlvo) <= TOLERANCIA_VALOR
            ) {
              match = { nota_id: n.id, item: it, criterio: "desc_valor" };
              break outer;
            }
          }
        }
      }

      if (match) {
        totals.legitimos++;
        auditoriaRows.push({
          job_id: jobId,
          preco_atual_id: p.id,
          produto_master_id: p.produto_master_id,
          produto_nome: p.produto_nome,
          estabelecimento_cnpj: cnpjN,
          estabelecimento_nome: p.estabelecimento_nome,
          valor_unitario: p.valor_unitario,
          data_atualizacao: p.data_atualizacao,
          user_id: p.user_id,
          classificacao: "legitimo",
          motivo: match.criterio === "ean" ? "ok_ean" : "ok_desc_valor",
          nota_imagem_id: match.nota_id,
          item_match: match.item as any,
          replicacao_count: replicacaoCount,
        });
      } else {
        totals.suspeitos++;
        totals.nota_sem_item++;
        auditoriaRows.push({
          job_id: jobId,
          preco_atual_id: p.id,
          produto_master_id: p.produto_master_id,
          produto_nome: p.produto_nome,
          estabelecimento_cnpj: cnpjN,
          estabelecimento_nome: p.estabelecimento_nome,
          valor_unitario: p.valor_unitario,
          data_atualizacao: p.data_atualizacao,
          user_id: p.user_id,
          classificacao: "suspeito",
          motivo: "nota_sem_item",
          replicacao_count: replicacaoCount,
          evidencia: { notas_candidatas: notas.length, ean_master: eanMaster || null },
        });
      }
    }

    if (auditoriaRows.length > 0) {
      const { error: insErr } = await supabase
        .from("precos_atuais_auditoria")
        .insert(auditoriaRows);
      if (insErr) {
        console.error(`[auditoria] erro insert lote:`, insErr.message);
      }
    }

    await supabase
      .from("precos_atuais_auditoria_jobs")
      .update({
        total_analisados: totals.analisados,
        total_legitimos: totals.legitimos,
        total_suspeitos: totals.suspeitos,
        total_nota_nao_encontrada: totals.nota_nao_encontrada,
        total_nota_sem_item: totals.nota_sem_item,
        total_master_invalido: totals.master_invalido,
        total_replicacao_cruzada: totals.replicacao_cruzada,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(
      `[auditoria] página ${page} (offset=${from}): ${precos.length} analisados | suspeitos=${totals.suspeitos}`,
    );

    if (precos.length < pageSize) break;
    from += pageSize;
    page++;
  }

  // Resumos
  const { data: top385 } = await supabase
    .from("precos_atuais_auditoria")
    .select("produto_nome, estabelecimento_nome, valor_unitario, classificacao, motivo, replicacao_count")
    .eq("job_id", jobId)
    .gte("valor_unitario", 3.84)
    .lte("valor_unitario", 3.86)
    .limit(50);

  const { data: topReplicados } = await supabase
    .from("precos_atuais_auditoria")
    .select("produto_nome, estabelecimento_nome, valor_unitario, replicacao_count, classificacao, motivo")
    .eq("job_id", jobId)
    .gte("replicacao_count", 3)
    .order("replicacao_count", { ascending: false })
    .limit(50);

  const { data: amostraSuspeitos } = await supabase
    .from("precos_atuais_auditoria")
    .select("produto_nome, estabelecimento_nome, valor_unitario, motivo, replicacao_count")
    .eq("job_id", jobId)
    .eq("classificacao", "suspeito")
    .limit(30);

  const { data: amostraLegitimos } = await supabase
    .from("precos_atuais_auditoria")
    .select("produto_nome, estabelecimento_nome, valor_unitario, motivo")
    .eq("job_id", jobId)
    .eq("classificacao", "legitimo")
    .limit(30);

  const resumo = {
    totais: totals,
    caso_3_85: top385 || [],
    replicacao_cruzada_top: topReplicados || [],
    amostra_suspeitos: amostraSuspeitos || [],
    amostra_legitimos: amostraLegitimos || [],
  };

  await supabase
    .from("precos_atuais_auditoria_jobs")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      resumo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  console.log(`[auditoria] concluída job=${jobId}`, totals);
}
