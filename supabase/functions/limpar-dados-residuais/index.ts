import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 🛑 NEUTRALIZADA — Fase 1 trava de segurança.
// Esta função executava DELETE em massa em estoque_app e diversas outras tabelas.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: 'Gone',
      message: 'Esta edge function foi DESATIVADA POR SEGURANÇA. Limpeza de resíduos via DELETE em massa está proibida. Use o pipeline de normalização atual.',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
