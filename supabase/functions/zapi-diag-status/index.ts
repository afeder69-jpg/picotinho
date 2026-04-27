// Diagnóstico TEMPORÁRIO: consulta status de mensagem e status da instância na Z-API.
// Somente leitura. Remover após uso.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const instanceUrl = Deno.env.get("WHATSAPP_INSTANCE_URL")!;
  const apiToken = Deno.env.get("WHATSAPP_API_TOKEN")!;
  const accountSecret = Deno.env.get("WHATSAPP_ACCOUNT_SECRET")!;

  const url = new URL(req.url);
  const messageId = url.searchParams.get("messageId") || "B4E2C6A929F6F50ACC74";
  const phone = url.searchParams.get("phone") || "5521999730895";

  const headers = { "Client-Token": accountSecret, "Content-Type": "application/json" };

  async function getJson(path: string) {
    try {
      const r = await fetch(`${instanceUrl}/token/${apiToken}${path}`, { headers });
      const text = await r.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep text */ }
      return { status: r.status, body };
    } catch (e: any) {
      return { status: 0, error: e?.message || String(e) };
    }
  }

  const [status, msgStatusV1, msgStatusV2, chatExists, chatMsgs] = await Promise.all([
    getJson(`/status`),
    getJson(`/message-status/${phone}/${messageId}`),
    getJson(`/chat-messages/${phone}?messageId=${messageId}`),
    getJson(`/phone-exists/${phone}`),
    getJson(`/chat-messages/${phone}`),
  ]);

  return new Response(
    JSON.stringify({ instancia: status, msgStatusV1, msgStatusV2, telefone_existe: chatExists, ultimasMsgs: chatMsgs }, null, 2),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
