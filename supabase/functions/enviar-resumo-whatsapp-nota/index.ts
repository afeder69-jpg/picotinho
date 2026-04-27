// Edge Function: enviar-resumo-whatsapp-nota
// Envia notificação ao usuário via WhatsApp após o processamento de uma nota.
// Suporta dois tipos:
//   - resumo_nota_processada (sucesso)
//   - falha_processamento_nota (falha final)
//
// Garantias:
// - Idempotência via UNIQUE (nota_id, canal, tipo) em notificacoes_log
// - Fire-and-forget: NÃO interfere no fluxo de processamento da nota
// - Respeita preferência pref_resumo_notas do usuário
// - Falhas de envio só geram log; nunca bloqueiam nada

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Tipo = "resumo_nota_processada" | "falha_processamento_nota";

interface Payload {
  nota_id: string;
  user_id: string;
  tipo: Tipo;
  // Campos opcionais usados apenas para tipo=resumo_nota_processada
  mercado?: string | null;
  total?: number | null;
  quantidade_itens?: number | null;
}

function formatarValorBRL(v: number | null | undefined): string {
  if (typeof v !== "number" || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function montarMensagemSucesso(p: Payload): string {
  const mercado = (p.mercado || "—").toString().trim() || "—";
  const total = formatarValorBRL(p.total ?? null);
  const itens = typeof p.quantidade_itens === "number" ? p.quantidade_itens : 0;

  return [
    "✅ Sua nota foi processada com sucesso!",
    "",
    "Seu estoque já foi atualizado.",
    "",
    `Mercado: ${mercado}`,
    `Total da nota: ${total}`,
    `Itens adicionados: ${itens}`,
    "",
    "Obrigado por usar o Picotinho.",
  ].join("\n");
}

function montarMensagemFalha(): string {
  return [
    "⚠️ Não conseguimos processar sua nota fiscal.",
    "",
    "Seu estoque ainda não foi atualizado.",
    "",
    "Tente enviar novamente pelo Picotinho. Se o QR Code não funcionar, você pode digitar a chave de acesso de 44 dígitos. Se for uma nota com DANFE, também pode tentar ler o código de barras.",
    "",
    "Se o problema continuar, nossa equipe poderá analisar o caso.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "JSON inválido" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { nota_id, user_id, tipo } = body;
  if (!nota_id || !user_id || !tipo) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "nota_id, user_id e tipo são obrigatórios",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (
    tipo !== "resumo_nota_processada" &&
    tipo !== "falha_processamento_nota"
  ) {
    return new Response(
      JSON.stringify({ success: false, error: "tipo inválido" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const canal = "whatsapp";

  try {
    // 1) Idempotência: já existe log para (nota_id, canal, tipo)?
    const { data: existente } = await supabase
      .from("notificacoes_log")
      .select("id, status")
      .eq("nota_id", nota_id)
      .eq("canal", canal)
      .eq("tipo", tipo)
      .maybeSingle();

    if (existente) {
      console.log(
        `⏭️ Notificação já registrada para nota=${nota_id} tipo=${tipo} (status=${existente.status}) — pulando.`,
      );
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "ja_enviada" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2) Buscar telefone autorizado do usuário (ativo + verificado) e checar preferência
    const { data: telefone, error: telErr } = await supabase
      .from("whatsapp_telefones_autorizados")
      .select("numero_whatsapp, ativo, verificado, pref_resumo_notas")
      .eq("usuario_id", user_id)
      .eq("ativo", true)
      .eq("verificado", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (telErr) {
      console.error("Erro ao buscar telefone:", telErr);
    }

    if (!telefone || !telefone.numero_whatsapp) {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        status: "pulado",
        erro: "sem_telefone_ativo_verificado",
      });
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "sem_telefone",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (telefone.pref_resumo_notas === false) {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        telefone: telefone.numero_whatsapp,
        status: "pulado",
        erro: "preferencia_desativada",
      });
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "preferencia_off",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3) Montar mensagem
    const mensagem =
      tipo === "resumo_nota_processada"
        ? montarMensagemSucesso(body)
        : montarMensagemFalha();

    // 4) Enviar via Z-API
    const instanceUrl = Deno.env.get("WHATSAPP_INSTANCE_URL");
    const apiToken = Deno.env.get("WHATSAPP_API_TOKEN");
    const accountSecret = Deno.env.get("WHATSAPP_ACCOUNT_SECRET");

    if (!instanceUrl || !apiToken || !accountSecret) {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        telefone: telefone.numero_whatsapp,
        status: "falhou",
        erro: "zapi_nao_configurado",
      });
      return new Response(
        JSON.stringify({ success: false, error: "Z-API não configurado" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;

    let zapiStatus = 0;
    let zapiBody = "";
    try {
      const resp = await fetch(sendTextUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": accountSecret,
        },
        body: JSON.stringify({
          phone: telefone.numero_whatsapp,
          message: mensagem,
        }),
      });
      zapiStatus = resp.status;
      zapiBody = await resp.text();
    } catch (e: any) {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        telefone: telefone.numero_whatsapp,
        status: "falhou",
        erro: `network_error: ${e?.message || String(e)}`,
      });
      return new Response(
        JSON.stringify({ success: false, error: "falha_rede_zapi" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let okEnvio = zapiStatus >= 200 && zapiStatus < 300;
    if (okEnvio) {
      try {
        const parsed = JSON.parse(zapiBody);
        if (parsed && parsed.error) okEnvio = false;
      } catch {
        // não-JSON: trate como sucesso (mesmo padrão das demais funções)
      }
    }

    await supabase.from("notificacoes_log").insert({
      nota_id,
      user_id,
      canal,
      tipo,
      telefone: telefone.numero_whatsapp,
      status: okEnvio ? "enviado" : "falhou",
      erro: okEnvio ? null : `zapi_status_${zapiStatus}: ${zapiBody.slice(0, 500)}`,
      payload: {
        zapi_status: zapiStatus,
        zapi_body_preview: zapiBody.slice(0, 500),
      },
    });

    return new Response(
      JSON.stringify({ success: okEnvio }),
      {
        status: okEnvio ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Erro inesperado em enviar-resumo-whatsapp-nota:", error);
    // Best effort: registrar log de falha sem quebrar idempotência
    try {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        status: "falhou",
        erro: `exception: ${error?.message || String(error)}`,
      });
    } catch {
      // ignore (provavelmente conflito de unique → já existe registro)
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
