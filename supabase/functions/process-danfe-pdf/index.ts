import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizarTextoNota(extractedText: string): string {
  let texto = extractedText;

  // 1. Corrigir acentuação básica (parser vem quebrado)
  const mapaAcentos: Record<string, string> = {
    "Emiss o": "Emissão",
    "S rie": "Série",
    "Cart o de D bito": "Cartão de Débito",
    "Informa o": "Informação",
    "Informa es": "Informações",
    "identifi cado": "identificado"
  };

  for (const [errado, certo] of Object.entries(mapaAcentos)) {
    const regex = new RegExp(errado, "gi");
    texto = texto.replace(regex, certo);
  }

  // 2. Inserir quebra de linha sempre que encontrar "Vl. Total"
  texto = texto.replace(/(Vl\. Total [0-9]+,[0-9]{2})/g, "$1\n");

  // 3. Inserir quebra de linha antes de "Qtd. total de itens"
  texto = texto.replace(/Qtd\. total de itens:/g, "\nQtd. total de itens:");

  // 4. Remover espaços duplos e normalizar
  texto = texto.replace(/\s+/g, " ").trim();

  return texto;
}

async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  // Converter o binário em string Latin1 para poder aplicar regex
  let pdfString = new TextDecoder("latin1").decode(new Uint8Array(pdfBuffer));

  // Usar regex para capturar SOMENTE os trechos de texto do PDF (entre parênteses)
  const textRegex = /\(([^)]+)\)/g;
  let extractedText = "";
  let match;
  while ((match = textRegex.exec(pdfString)) !== null) {
    extractedText += match[1] + "\n"; // manter quebra de linha
  }

  // Corrigir caracteres quebrados comuns
  extractedText = extractedText
    .replace(/C digo/g, "Código")
    .replace(/Emiss o/g, "Emissão")
    .replace(/Cart o/g, "Cartão")
    .replace(/Informa o/g, "Informação")
    .replace(/Informa es/g, "Informações")
    .replace(/n o/g, "não")
    .replace(/fi cado/g, "ficado")
    .replace(/ç/g, "ç")
    .replace(/Ç/g, "Ç");

  // Corrigir colagem de "Qtd. total de itens" com valor
  extractedText = extractedText.replace(
    /(\d+)\s+(\d+,\d{2})/g,
    "\nQtd. total de itens: $1\nValor Total: R$ $2"
  );

  // Limpeza final
  extractedText = extractedText
    .replace(/\s{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  console.log("📝 Texto extraído (primeiros 500 caracteres):");
  console.log(extractedText.slice(0, 500));

  return extractedText;
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
    let extractedText = await extractTextFromPDF(new Uint8Array(buffer));

    // Normalizar o texto antes de salvar
    extractedText = normalizarTextoNota(extractedText);

    console.log("📝 Texto normalizado da DANFE:");
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

    // 🛢️ SALVAR TEXTO EXTRAÍDO NO BANCO (versão ultra simples)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.7.1");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Texto simples para teste - apenas ASCII básico
      const textoLimpo = "TESTE: " + extractedText
        .replace(/[^\x20-\x7E]/g, ' ') // Apenas ASCII imprimível
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 10000); // Máximo 10k chars

      console.log("🧹 Tentando salvar texto (tamanho):", textoLimpo.length);
      console.log("🧹 Primeiros 200 chars:", textoLimpo.substring(0, 200));

      const { data, error: updateError } = await supabase
        .from("notas_imagens")
        .update({
          debug_texto: textoLimpo
        })
        .eq("id", notaImagemId)
        .select();

      if (updateError) {
        console.error("❌ ERRO BANCO:", updateError);
        
        // Tentar com texto ainda mais simples
        const textoMinimo = "FUNCIONOU! Produtos encontrados: " + extractedText.length + " caracteres extraidos";
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
      texto: extractedText.slice(0, 2000), // preview
      textoCompleto: extractedText // texto completo na resposta
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