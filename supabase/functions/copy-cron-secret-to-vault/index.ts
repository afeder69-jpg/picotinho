// Edge Function TEMPORÁRIA: copy-cron-secret-to-vault
// Uso único: copia o valor do env CRON_NOTIFICACOES_SECRET para o
// Vault do Supabase, sem expor o valor em logs/código/migration.
// Será DELETADA imediatamente após sucesso.
//
// Segurança:
// - Exige header `x-cron-secret` igual ao próprio CRON_NOTIFICACOES_SECRET.
// - Não loga o valor.
// - Idempotente: se já existir o secret no Vault, atualiza.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SECRET_NAME = "CRON_NOTIFICACOES_SECRET";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get(SECRET_NAME);
  if (!cronSecret) {
    return new Response(
      JSON.stringify({ error: `${SECRET_NAME} não configurado` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const headerSecret = req.headers.get("x-cron-secret");
  if (!headerSecret || headerSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verifica se já existe; se sim, atualiza, senão cria.
  const { data: existing, error: errSel } = await supabase
    .schema("vault")
    .from("secrets")
    .select("id, name")
    .eq("name", SECRET_NAME)
    .maybeSingle();

  if (errSel) {
    // Vault pode não estar exposto via PostgREST — usar RPC
    console.error("Falha ao consultar vault.secrets via PostgREST, tentando RPC.");
  }

  let action = "unknown";
  if (existing?.id) {
    const { error: errUpd } = await supabase.rpc("vault_update_cron_secret", {
      p_value: cronSecret,
    });
    if (errUpd) {
      return new Response(
        JSON.stringify({ error: "update_failed", detail: errUpd.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    action = "updated";
  } else {
    const { error: errIns } = await supabase.rpc("vault_create_cron_secret", {
      p_value: cronSecret,
    });
    if (errIns) {
      return new Response(
        JSON.stringify({ error: "create_failed", detail: errIns.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    action = "created";
  }

  return new Response(
    JSON.stringify({ ok: true, action, secret_name: SECRET_NAME }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
