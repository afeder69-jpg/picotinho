import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_NOTIFICACOES_SECRET")!;

Deno.test("copia secret para o vault", async () => {
  const r = await fetch(
    `${SUPABASE_URL}/functions/v1/copy-cron-secret-to-vault`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON}`,
        apikey: SUPABASE_ANON,
        "x-cron-secret": CRON_SECRET,
      },
    },
  );
  const body = await r.json();
  console.log("Resultado:", body);
  assertEquals(r.status, 200);
  assertEquals(body.ok, true);
});
