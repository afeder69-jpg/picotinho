import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 🛑 NEUTRALIZADA — Fase 1 trava de segurança.
// Esta função invocava limpar-dados-residuais com user_id hard-coded.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: 'Gone',
      message: 'Esta edge function foi DESATIVADA POR SEGURANÇA. Continha user_id hard-coded e invocava função de limpeza perigosa.',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
