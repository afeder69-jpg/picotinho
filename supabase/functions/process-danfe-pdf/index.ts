import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    // Import pdfjs-dist usando uma abordagem compatível com Deno
    const { getDocument } = await import("npm:pdfjs-dist@4.0.379/build/pdf.mjs");
    
    const pdf = await getDocument({ data: pdfBuffer }).promise;
    let extractedText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      extractedText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
    }
    
    return extractedText.trim();
  } catch (error) {
    console.error("❌ Erro ao extrair texto do PDF:", error);
    // Fallback: tentar extrair texto simples usando regex
    const pdfString = new TextDecoder("latin1").decode(pdfBuffer);
    const regex = /\(([^)]+)\)/g;
    let extractedText = "";
    let match;
    while ((match = regex.exec(pdfString)) !== null) {
      extractedText += match[1] + " ";
    }
    return extractedText.trim();
  }
}

function normalizarTextoDanfe(texto: string): string {
  return texto
    // Correções de acentuação e cedilha
    .replace(/C digo/g, "Código")
    .replace(/Cart o/g, "Cartão")
    .replace(/D bito/g, "Débito")
    .replace(/Informa o/g, "Informação")
    .replace(/Informa es/g, "Informações")
    .replace(/Emiss o/g, "Emissão")
    .replace(/N mero/g, "Número")
    .replace(/S rie/g, "Série")
    .replace(/Autoriza o/g, "Autorização")
    .replace(/n o/g, "não")
    .replace(/fi cado/g, "ficado")

    // Expansão de abreviações mais comuns em DANFE
    .replace(/\bQtde\./g, "Quantidade")
    .replace(/\bVl\. Unit\./g, "Valor Unitário")
    .replace(/\bVl\. Total/g, "Valor Total")
    .replace(/\bUN\b/g, "Unidade")
    .replace(/\bkg\b/gi, "Kg")
    .replace(/\bg\b/gi, "Gramas")
    .replace(/\bLT\b/gi, "Litros")

    // Limpeza de espaços duplicados
    .replace(/\s{2,}/g, " ")
    .trim();
}

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

    // 📄 Extrair texto do PDF usando pdfjs-dist
    console.log("📄 Extraindo texto do PDF...");
    const extractedText = await extractTextFromPDF(new Uint8Array(buffer));
    const textoLimpo = normalizarTextoDanfe(extractedText);

    console.log("📝 Texto limpo DANFE:");
    console.log(textoLimpo.slice(0, 2000)); // primeiras 2000 chars
    console.log("=".repeat(80));

    if (!textoLimpo || textoLimpo.length < 50) {
      return new Response(JSON.stringify({
        success: false,
        error: "INSUFFICIENT_TEXT",
        message: "PDF não contém texto suficiente — provavelmente é escaneado",
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 🛢️ SALVAR TEXTO EXTRAÍDO NO BANCO (versão ultra simples)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.7.1");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Texto normalizado para salvar no banco
      const textoParaSalvar = "TESTE: " + textoLimpo
        .replace(/[^\x20-\x7E]/g, ' ') // Apenas ASCII imprimível
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 10000); // Máximo 10k chars

      console.log("🧹 Tentando salvar texto (tamanho):", textoParaSalvar.length);
      console.log("🧹 Primeiros 200 chars:", textoParaSalvar.substring(0, 200));

      const { data, error: updateError } = await supabase
        .from("notas_imagens")
        .update({
          debug_texto: textoParaSalvar
        })
        .eq("id", notaImagemId)
        .select();

      if (updateError) {
        console.error("❌ ERRO BANCO:", updateError);
        
        // Tentar com texto ainda mais simples
        const textoMinimo = "FUNCIONOU! Produtos encontrados: " + textoLimpo.length + " caracteres extraidos";
        const { error: fallbackError } = await supabase
          .from("notas_imagens")
          .update({ debug_texto: textoMinimo })
          .eq("id", notaImagemId);
        
        if (!fallbackError) {
          console.log("✅ Salvou texto mínimo");
        }
      } else {
        console.log("✅ SUCESSO! Texto salvo:", data);
      }
    } catch (dbErr) {
      console.error("❌ Erro geral:", dbErr);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Texto extraído com sucesso",
      texto: textoLimpo.slice(0, 2000), // preview
      textoCompleto: textoLimpo // texto completo na resposta
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