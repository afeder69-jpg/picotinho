import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_NOTIFICACOES_SECRET")!;

const FN_URL = `${SUPABASE_URL}/functions/v1/cron-notificar-notas-processadas`;

Deno.test("retorna 401 sem header x-cron-secret", async () => {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
  });
  await r.text();
  assertEquals(r.status, 401);
});

Deno.test("retorna 401 com x-cron-secret incorreto", async () => {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON}`,
      apikey: SUPABASE_ANON,
      "x-cron-secret": "valor-incorreto-xyz",
    },
  });
  await r.text();
  assertEquals(r.status, 401);
});

Deno.test("retorna 200 com x-cron-secret correto", async () => {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON}`,
      apikey: SUPABASE_ANON,
      "x-cron-secret": CRON_SECRET,
    },
  });
  const body = await r.json();
  console.log("Resposta:", body);
  assertEquals(r.status, 200);
  assertEquals(body.ok, true);
});
