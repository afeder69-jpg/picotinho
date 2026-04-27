// Edge Function: cron-notificar-notas-processadas
// Detecta notas elegíveis para notificação WhatsApp e invoca
// `enviar-resumo-whatsapp-nota` para cada uma. NÃO duplica a lógica de envio.
//
// Segurança:
// - Validação obrigatória do header `x-cron-secret` contra o secret
//   `CRON_NOTIFICACOES_SECRET`.
//
// Critério de elegibilidade (notas):
// - processada = true
// - excluida = false (ou nulo)
// - status_processamento = 'processada' (sucesso)
// - data_criacao recente (janela de 24h por padrão)
// - sem registro em `notificacoes_log` para
//   (nota_id, canal='whatsapp', tipo='resumo_nota_processada')
//
// Observação: a idempotência real é garantida pela função de envio
// (UNIQUE em notificacoes_log). Aqui filtramos apenas para evitar
// invocações desnecessárias.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 1) Validação do secret
  const cronSecret = Deno.env.get("CRON_NOTIFICACOES_SECRET");
  if (!cronSecret) {
    return jsonResponse(
      { error: "CRON_NOTIFICACOES_SECRET não configurado" },
      500,
    );
  }
  const headerSecret = req.headers.get("x-cron-secret");
  if (!headerSecret || headerSecret !== cronSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 2) Buscar notas candidatas (últimas 24h)
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 2a) Sucessos: processada = true + status_processamento = 'processada'
  const { data: notasSucesso, error: errNotas } = await supabase
    .from("notas_imagens")
    .select(
      "id, usuario_id, dados_extraidos, data_criacao, status_processamento, processada, excluida",
    )
    .eq("processada", true)
    .eq("status_processamento", "processada")
    .or("excluida.is.null,excluida.eq.false")
    .gte("data_criacao", desde)
    .order("data_criacao", { ascending: false })
    .limit(200);

  if (errNotas) {
    console.error("Erro ao buscar notas candidatas (sucesso):", errNotas);
    return jsonResponse({ error: errNotas.message }, 500);
  }

  // 2b) Falhas: status_processamento ∈ {erro, falha, failed, error}
  // Independente de processada (a maioria das falhas mantém processada=false)
  const STATUS_FALHA = ["erro", "falha", "failed", "error"];
  const { data: notasFalha, error: errNotasF } = await supabase
    .from("notas_imagens")
    .select(
      "id, usuario_id, data_criacao, status_processamento, excluida",
    )
    .in("status_processamento", STATUS_FALHA)
    .or("excluida.is.null,excluida.eq.false")
    .gte("data_criacao", desde)
    .order("data_criacao", { ascending: false })
    .limit(200);

  if (errNotasF) {
    console.error("Erro ao buscar notas candidatas (falha):", errNotasF);
    return jsonResponse({ error: errNotasF.message }, 500);
  }

  const totalCandidatas =
    (notasSucesso?.length || 0) + (notasFalha?.length || 0);
  if (totalCandidatas === 0) {
    return jsonResponse({
      ok: true,
      candidatas: 0,
      candidatas_sucesso: 0,
      candidatas_falha: 0,
      invocadas: 0,
    });
  }

  // 3) Buscar logs existentes por (tipo) para filtrar duplicatas
  // Idempotência real é garantida no envio (UNIQUE em notificacoes_log).
  const idsSucesso = (notasSucesso || []).map((n) => n.id);
  const idsFalha = (notasFalha || []).map((n) => n.id);
  const todosIds = Array.from(new Set([...idsSucesso, ...idsFalha]));

  const { data: logs, error: errLogs } = await supabase
    .from("notificacoes_log")
    .select("nota_id, tipo")
    .eq("canal", "whatsapp")
    .in("tipo", ["resumo_nota_processada", "falha_processamento_nota"])
    .in("nota_id", todosIds);

  if (errLogs) {
    console.error("Erro ao buscar notificacoes_log:", errLogs);
    return jsonResponse({ error: errLogs.message }, 500);
  }

  const jaSucesso = new Set(
    (logs || [])
      .filter((l) => l.tipo === "resumo_nota_processada")
      .map((l) => l.nota_id),
  );
  const jaFalha = new Set(
    (logs || [])
      .filter((l) => l.tipo === "falha_processamento_nota")
      .map((l) => l.nota_id),
  );

  const elegiveisSucesso = (notasSucesso || []).filter(
    (n) => !jaSucesso.has(n.id),
  );
  const elegiveisFalha = (notasFalha || []).filter((n) => !jaFalha.has(n.id));

  // 4) Invocar enviar-resumo-whatsapp-nota
  let invocadas = 0;
  let falhasInvoke = 0;

  // 4a) Sucessos
  for (const nota of elegiveisSucesso) {
    const dados = (nota.dados_extraidos ?? {}) as Record<string, unknown>;

    const mercado =
      (dados as any)?.mercado?.nome ??
      (dados as any)?.estabelecimento?.nome ??
      (dados as any)?.emitente?.nome ??
      (dados as any)?.mercado ??
      null;

    const total =
      (dados as any)?.total ??
      (dados as any)?.compra?.valor_total ??
      (dados as any)?.valor_total ??
      null;

    const itens = Array.isArray((dados as any)?.itens)
      ? (dados as any).itens.length
      : Array.isArray((dados as any)?.produtos)
        ? (dados as any).produtos.length
        : null;

    const payload = {
      nota_id: nota.id,
      user_id: nota.usuario_id,
      tipo: "resumo_nota_processada" as const,
      mercado: typeof mercado === "string" ? mercado : null,
      total: typeof total === "number" ? total : Number(total) || null,
      quantidade_itens: typeof itens === "number" ? itens : null,
    };

    try {
      const { error: errInvoke } = await supabase.functions.invoke(
        "enviar-resumo-whatsapp-nota",
        { body: payload },
      );
      if (errInvoke) {
        falhasInvoke++;
        console.error(
          `Falha ao invocar (sucesso) nota ${nota.id}:`,
          errInvoke,
        );
      } else {
        invocadas++;
      }
    } catch (e) {
      falhasInvoke++;
      console.error(`Exceção ao invocar (sucesso) nota ${nota.id}:`, e);
    }
  }

  // 4b) Falhas
  for (const nota of elegiveisFalha) {
    const payload = {
      nota_id: nota.id,
      user_id: nota.usuario_id,
      tipo: "falha_processamento_nota" as const,
    };

    try {
      const { error: errInvoke } = await supabase.functions.invoke(
        "enviar-resumo-whatsapp-nota",
        { body: payload },
      );
      if (errInvoke) {
        falhasInvoke++;
        console.error(
          `Falha ao invocar (falha) nota ${nota.id}:`,
          errInvoke,
        );
      } else {
        invocadas++;
      }
    } catch (e) {
      falhasInvoke++;
      console.error(`Exceção ao invocar (falha) nota ${nota.id}:`, e);
    }
  }

  return jsonResponse({
    ok: true,
    candidatas: totalCandidatas,
    candidatas_sucesso: notasSucesso?.length || 0,
    candidatas_falha: notasFalha?.length || 0,
    elegiveis_sucesso: elegiveisSucesso.length,
    elegiveis_falha: elegiveisFalha.length,
    invocadas,
    falhas: falhasInvoke,
  });
});
