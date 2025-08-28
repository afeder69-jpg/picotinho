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

    // 🤖 Chamada para GPT
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // pode usar gpt-4o ou gpt-5 se disponível
        messages: [
          {
            role: "system",
            content: `Você é um especialista em notas fiscais brasileiras (DANFE NFC-e).
Extraia todos os itens da compra. 
⚠️ Cada produto começa com o nome, seguido de (Código: XXXXX).
⚠️ Sempre capture: descricao, codigo, quantidade, unidade, preco_unitario, preco_total.
⚠️ Não pule itens repetidos — se aparecer 2 vezes, registre 2 vezes.
⚠️ O total de itens deve bater com "Qtd. total de itens" no fim do texto.
Responda APENAS em JSON válido.`
          },
          {
            role: "user",
            content: extractedText
          }
        ],
        max_tokens: 4000
      }),
    });

    const aiResult = await aiResponse.json();
    console.log("🤖 Resposta bruta da IA:", JSON.stringify(aiResult, null, 2));

    const aiContent = aiResult.choices?.[0]?.message?.content;
    if (!aiContent) {
      throw new Error("IA não retornou conteúdo");
    }

    let dadosExtraidos;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      dadosExtraidos = JSON.parse(jsonMatch ? jsonMatch[0] : aiContent);
    } catch (err) {
      console.error("❌ Erro no parse do JSON da IA:", err.message);
      console.log("Conteúdo recebido:", aiContent);
      throw new Error("AI_PARSE_FAILED");
    }

    console.log("📊 JSON PARSEADO:");
    console.log(JSON.stringify(dadosExtraidos, null, 2));

    // 🛢️ SALVAR NO BANCO
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.7.1");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { error: insertError } = await supabase
        .from("notas_imagens")
        .update({
          dados_extraidos: {
            debugTextoExtraido: extractedText.slice(0, 3000),
            debugRespostaIA: aiResult,
            parsed: dadosExtraidos
          },
          processada: dadosExtraidos?.itens?.length > 0
        })
        .eq("id", notaImagemId);

      if (insertError) {
        console.error("❌ Erro ao salvar no banco:", insertError.message);
      } else {
        console.log("✅ Dados salvos no banco em notas_imagens");
      }
    } catch (dbErr) {
      console.error("❌ Erro de banco:", dbErr.message);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `PDF processado com ${dadosExtraidos?.itens?.length || 0} itens`,
      dados: dadosExtraidos
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