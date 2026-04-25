import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 🛑 NEUTRALIZADA — Fase 1 trava de segurança.
// Esta função executava DELETE em estoque_app (quantidade=0 e duplicados),
// agora bloqueado pelo trigger estoque_app_block_bulk_delete_trg.
// Consolidação de duplicados deve ser feita via fluxo de normalização master atual.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: 'Gone',
      message: 'Esta edge function foi DESATIVADA POR SEGURANÇA. Use o fluxo de normalização e consolidação master oficial.',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
