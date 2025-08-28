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
    const { pdfUrl, notaImagemId, userId } = await req.json();

    if (!pdfUrl || !notaImagemId || !userId) {
      return new Response(JSON.stringify({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "Parâmetros obrigatórios ausentes"
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log("📥 Baixando PDF:", pdfUrl);
    const resp = await fetch(pdfUrl);
    if (!resp.ok) throw new Error(`Falha ao baixar PDF: ${resp.status}`);
    const buffer = await resp.arrayBuffer();

    // 📄 Extrair texto bruto do PDF
    const pdfString = new TextDecoder("latin1").decode(new Uint8Array(buffer));
    const regex = /\(([^)]+)\)/g;
    let extractedText = "";
    let match;
    while ((match = regex.exec(pdfString)) !== null) {
      extractedText += match[1] + " ";
    }

    console.log("📝 Texto bruto extraído do PDF:");
    console.log(extractedText.slice(0, 2000)); // primeiras 2000 chars
    console.log("=".repeat(80));

    if (!extractedText || extractedText.length < 50) {
      return new Response(JSON.stringify({
        success: false,
        error: "INSUFFICIENT_TEXT",
        message: "PDF não contém texto suficiente — provavelmente é escaneado",
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 🛢️ SALVAR TEXTO EXTRAÍDO NO BANCO
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.7.1");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { error: updateError } = await supabase
        .from("notas_imagens")
        .update({
          debug_texto: extractedText
        })
        .eq("id", notaImagemId);

      if (updateError) {
        console.error("❌ Erro ao salvar texto no banco:", updateError.message);
      } else {
        console.log("✅ Texto extraído salvo no banco");
      }
    } catch (dbErr) {
      console.error("❌ Erro de banco:", dbErr.message);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Texto extraído com sucesso",
      texto: extractedText.slice(0, 2000) // apenas preview
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("❌ Erro geral:", err.message);
    return new Response(JSON.stringify({
      success: false,
      error: "GENERAL_ERROR",
      message: err.message
    }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});