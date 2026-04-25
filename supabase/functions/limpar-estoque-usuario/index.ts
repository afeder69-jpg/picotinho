import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 🛑 NEUTRALIZADA — Fase 1 trava de segurança.
// Esta função fazia DELETE FROM estoque_app WHERE user_id = ... (apagava histórico).
// A regra de ouro do projeto exige UPDATE quantidade=0 (preservar histórico).
// Use a RPC `limpar_estoque_usuario(uuid)` via supabase.rpc() — é a única forma autorizada.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: 'Gone',
      message: 'Esta edge function foi DESATIVADA POR SEGURANÇA. Ela executava DELETE em massa em estoque_app, violando a regra de ouro do projeto. Use a RPC limpar_estoque_usuario(uuid) que apenas zera quantidades preservando o histórico.',
      replacement: "supabase.rpc('limpar_estoque_usuario', { usuario_uuid: <id> })",
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
