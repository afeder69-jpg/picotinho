// Orquestrador one-shot — Fase 2: reconstruir estoque das 23 notas
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USER_ID = "ae5b5501-7f8a-46da-9cba-b9955a84e697";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SRK);

  const { data: notas, error: errN } = await supabase
    .from("notas_imagens")
    .select("id, created_at")
    .eq("usuario_id", USER_ID)
    .eq("excluida", false)
    .not("dados_extraidos", "is", null)
    .order("created_at", { ascending: true });

  if (errN || !notas) {
    return new Response(JSON.stringify({ error: errN?.message || "sem notas" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resultados: any[] = [];
  for (let i = 0; i < notas.length; i++) {
    const n = notas[i];
    try {
      await supabase.from("notas_imagens")
        .update({ processada: false, normalizada: false, tentativas_finalizacao: 0 })
        .eq("id", n.id);

      const r = await fetch(`${SUPABASE_URL}/functions/v1/process-receipt-full`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SRK}`,
          apikey: SRK,
        },
        body: JSON.stringify({ notaImagemId: n.id, forceReprocess: true }),
      });
      const txt = await r.text();
      let j: any = null; try { j = JSON.parse(txt); } catch {}
      const ok = r.ok && (j?.success !== false);
      console.log(`[${i + 1}/${notas.length}] ${n.id.slice(0, 8)} ${ok ? "OK" : "FAIL"} status=${r.status}`);
      resultados.push({
        id: n.id, ok, status: r.status,
        produtos_inseridos: j?.produtos_inseridos ?? j?.itens_processados ?? null,
        msg: j?.message || j?.error || (ok ? "" : txt.slice(0, 300)),
      });
    } catch (e: any) {
      console.log(`[${i + 1}/${notas.length}] ${n.id.slice(0, 8)} EXC ${e.message}`);
      resultados.push({ id: n.id, ok: false, msg: e.message });
    }
    await new Promise((res) => setTimeout(res, 1000));
  }

  const sucesso = resultados.filter((r) => r.ok).length;
  const { count: estoqueCount } = await supabase
    .from("estoque_app")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID);

  return new Response(JSON.stringify({
    total_notas: notas.length,
    sucesso,
    falhas: notas.length - sucesso,
    estoque_final_registros: estoqueCount,
    resultados,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
