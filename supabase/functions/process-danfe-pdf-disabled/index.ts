import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ⚠️ FUNÇÃO DESABILITADA ⚠️
 * 
 * Esta função foi desabilitada como parte da limpeza de arquitetura.
 * O processamento de PDFs agora é feito exclusivamente pela IA-2 (normalizar-produto-ia2)
 * via extract-receipt-image, que salva tudo em notas_imagens.
 * 
 * As tabelas notas_fiscais e compras_app foram removidas do sistema.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    success: false,
    error: "FUNCTION_DISABLED",
    message: "Esta função foi desabilitada. Use extract-receipt-image para processar PDFs."
  }), { 
    status: 410, // Gone
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
