import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ⚠️ FUNÇÃO DESABILITADA ⚠️
 * 
 * Esta função foi desabilitada como parte da limpeza de arquitetura.
 * A tabela notas_fiscais foi removida do sistema.
 * 
 * Todos os dados de notas fiscais agora estão em notas_imagens.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ 
      success: false,
      error: 'FUNCTION_DISABLED',
      message: 'Esta função foi desabilitada. A tabela notas_fiscais não existe mais.'
    }),
    { 
      status: 410, // Gone
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
});
