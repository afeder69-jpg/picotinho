import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const { pdfUrl } = await req.json();

    if (!pdfUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "O parâmetro pdfUrl é obrigatório"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("📥 Baixando PDF:", pdfUrl);
    const resp = await fetch(pdfUrl);
    if (!resp.ok) throw new Error(`Falha ao baixar PDF: ${resp.status}`);
    const buffer = await resp.arrayBuffer();

    // 📄 Decodificar PDF em texto bruto
    let pdfString = new TextDecoder("latin1").decode(new Uint8Array(buffer));

    // 📝 Extrair apenas trechos de texto entre parênteses
    const regex = /\(([^)]+)\)/g;
    let extractedText = "";
    let match;
    while ((match = regex.exec(pdfString)) !== null) {
      extractedText += match[1] + " ";
    }

    if (!extractedText || extractedText.length < 50) {
      return new Response(JSON.stringify({
        success: false,
        error: "INSUFFICIENT_TEXT",
        message: "PDF não contém texto suficiente — provavelmente é PDF escaneado",
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("✅ Texto extraído com sucesso. Tamanho:", extractedText.length);

    return new Response(JSON.stringify({
      success: true,
      message: "Texto extraído com sucesso",
      length: extractedText.length,
      texto: extractedText.slice(0, 2000) // debug parcial
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("❌ Erro no processamento:", err);
    return new Response(JSON.stringify({
      success: false,
      error: "GENERAL_ERROR",
      message: err.message,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});