import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 🛑 NEUTRALIZADA — Fase 1 trava de segurança.
// Esta função apagava receipts, notas, notas_imagens, estoque_app, precos_atuais_usuario,
// produtos, mercados e categorias do usuário em cascata. Risco extremo.
// Exclusão total de conta deve ser fluxo explícito separado, com confirmação forte.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: 'Gone',
      message: 'Esta edge function foi DESATIVADA POR SEGURANÇA. Ela executava DELETE em massa em múltiplas tabelas do usuário (estoque, notas, recibos, preços). Exclusão total de conta deve ser fluxo dedicado e explícito.',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
