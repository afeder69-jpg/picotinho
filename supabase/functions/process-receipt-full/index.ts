import { serve } from "std/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// 🔹 Buscar ou criar produto com categoria válida
async function buscarOuCriarProduto(
  descricaoNormalizada: string,
  categoriaNome: string,
  unidadeMedida: string
) {
  // 1. Buscar categoria pelo nome
  const { data: categoria, error: catErr } = await supabase
    .from("categorias")
    .select("id")
    .eq("nome", categoriaNome.toUpperCase())
    .single();

  let categoriaId: string | null = null;

  if (catErr || !categoria) {
    console.warn(
      `⚠️ Categoria '${categoriaNome}' não encontrada. Usando OUTROS.`
    );

    // Buscar categoria "OUTROS"
    const { data: catOutros } = await supabase
      .from("categorias")
      .select("id")
      .eq("nome", "OUTROS")
      .single();

    categoriaId = catOutros?.id || null;
  } else {
    categoriaId = categoria.id;
  }

  // 2. Procurar produto já existente
  const { data: existente } = await supabase
    .from("produtos_app")
    .select("id")
    .eq("nome", descricaoNormalizada)
    .maybeSingle();

  if (existente) return existente.id;

  // 3. Criar novo produto
  const { data: novo, error: insertErr } = await supabase
    .from("produtos_app")
    .insert({
      nome: descricaoNormalizada,
      categoria_id: categoriaId, // ✅ sempre válido agora
      unidade_medida: unidadeMedida,
      ativo: true,
      descricao: `Produto criado automaticamente: ${descricaoNormalizada}`,
    })
    .select("id")
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return novo.id;
}

serve(async (req) => {
  try {
    const { nota_id } = await req.json();

    console.log("📥 Recebendo processamento da nota:", nota_id);

    // 1. Buscar dados extraídos da nota
    const { data: nota } = await supabase
      .from("notas_imagens")
      .select("dados_extraidos")
      .eq("id", nota_id)
      .single();

    if (!nota) throw new Error("Nota não encontrada");

    const dados = nota.dados_extraidos;

    console.log("Itens brutos recebidos:", dados.itens?.length);

    // 2. Consolidar itens (IA já normalizou antes)
    const itens = dados.itens || [];
    console.log("Itens consolidados:", itens.length);

    // 3. Processar cada item
    for (const item of itens) {
      const produtoId = await buscarOuCriarProduto(
        item.descricao,
        item.categoria || "OUTROS",
        item.unidade || "UN"
      );

      // Inserir no estoque
      await supabase.from("estoque_app").insert({
        produto_id: produtoId,
        quantidade: item.quantidade,
        preco_unitario_ultimo: item.valor_unitario,
        created_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({ status: "ok", processados: itens.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ Erro geral:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
