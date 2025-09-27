import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🧪 TESTE: Chamando process-danfe-pdf com flag USE_AWAIT_FOR_IA_2=true");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    const response = await fetch(`${supabaseUrl}/functions/v1/process-danfe-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfUrl: "https://mjsbwrtegorjxcepvrik.supabase.co/storage/v1/object/public/receipts/ae5b5501-7f8a-46da-9cba-b9955a84e697/whatsapp_1758988340795_documento.pdf",
        notaImagemId: "37b8b17d-5cb9-4030-b854-399146f79928", 
        userId: "ae5b5501-7f8a-46da-9cba-b9955a84e697"
      })
    });

    const result = await response.json();
    
    console.log("📊 RESULTADO DO TESTE:", result);
    
    return new Response(JSON.stringify({
      success: true,
      testResult: result,
      message: "Teste executado - verificar logs para T1 → T2 → Resultado"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ Erro no teste:", error);
    return new Response(
      JSON.stringify({ 
        error: "Erro no teste",
        message: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});