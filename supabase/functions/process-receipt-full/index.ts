// supabase/functions/process-receipt-full/index.ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function nowIso() {
  return new Date().toISOString();
}

function normalizar(texto: string): string {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberBR(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normUnidade(u: unknown): string {
  const s = String(u ?? "").trim().toUpperCase();
  if (!s) return "UN";
  if (["UN", "UNID", "UNIDADE", "UND"].includes(s)) return "UN";
  if (["KG", "K", "KILOS", "KILO"].includes(s)) return "KG";
  if (["G", "GR", "GRAMAS"].includes(s)) return "G";
  if (["L", "LT", "LITRO", "LITROS"].includes(s)) return "L";
  if (["ML", "MILILITRO", "MILILITROS"].includes(s)) return "ML";
  return s;
}

function pickDescricao(item: any): string {
  return (
    String(
      item?.descricao ??
        item?.produto_nome_normalizado ??
        item?.nome ??
        item?.nome_produto ??
        ""
    ).trim() || "DESCRIÇÃO INVÁLIDA"
  );
}
function pickQuantidade(item: any): number | null {
  return parseNumberBR(item?.quantidade ?? item?.qtd_valor ?? item?.qtd ?? item?.qtdValor);
}
function pickValorUnitario(item: any): number | null {
  return parseNumberBR(
    item?.valor_unitario ??
      item?.precoUnitario ??
      item?.preco_unitario ??
      item?.valorUnit
  );
}
function pickUnidade(item: any): string {
  return normUnidade(item?.unidade ?? item?.qtd_unidade ?? item?.unid ?? item?.unidade_medida);
}
function pickCategoria(item: any): string {
  return String(item?.categoria ?? "OUTROS").trim().toUpperCase();
}

async function buscarOuCriarProduto(supabase: any, descricaoNormalizada: string, categoria: string, unidadeMedida: string) {
  const { data: existente } = await supabase
    .from("produtos_app")
    .select("id")
    .eq("nome", descricaoNormalizada)
    .single();

  if (existente) return existente.id;

  const { data: novo, error } = await supabase
    .from("produtos_app")
    .insert({
      nome: descricaoNormalizada,
      categoria_id: null,
      unidade_medida: unidadeMedida,
      ativo: true,
      descricao: `Produto criado automaticamente: ${descricaoNormalizada}`,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return novo.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = nowIso();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { imagemId, notaImagemId } = body || {};
    const finalImagemId: string | null = imagemId || notaImagemId || null;

    if (!finalImagemId) {
      return new Response(JSON.stringify({ success: false, error: "ID da imagem é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🏁 [${startedAt}] process-receipt-full START - nota_id=${finalImagemId}`);

    const { data: notaImagem, error: notaError } = await supabase
      .from("notas_imagens")
      .select("id, dados_extraidos, processada, usuario_id, compra_id")
      .eq("id", finalImagemId)
      .single();

    if (notaError || !notaImagem) {
      return new Response(JSON.stringify({ success: false, error: "Nota não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itens: any[] = notaImagem.dados_extraidos?.itens ?? [];
    if (itens.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Nenhum item encontrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const produtos: any[] = [];
    const itensCompra: any[] = [];

    for (const raw of itens) {
      const descricaoOriginal = pickDescricao(raw);
      const descricaoNormalizada = normalizar(descricaoOriginal) || descricaoOriginal.toUpperCase();
      const quantidade = pickQuantidade(raw);
      const valorUnitario = pickValorUnitario(raw);
      const unidade = pickUnidade(raw);
      const categoria = pickCategoria(raw);

      if (quantidade === null || valorUnitario === null) continue;

      const produtoId = await buscarOuCriarProduto(supabase, descricaoNormalizada, categoria, unidade);

      produtos.push({
        user_id: notaImagem.usuario_id,
        nota_id: notaImagem.id,
        produto_nome: descricaoNormalizada,
        categoria,
        quantidade,
        unidade_medida: unidade,
        preco_unitario_ultimo: valorUnitario,
        compra_id: notaImagem.compra_id,
        origem: "nota_fiscal",
      });

      if (notaImagem.compra_id) {
        itensCompra.push({
          compra_id: notaImagem.compra_id,
          produto_id: produtoId,
          quantidade,
          preco_unitario: valorUnitario,
          preco_total: quantidade * valorUnitario,
        });
      }
    }

    // Inserir no estoque com logs detalhados
    const { data: inserted, error: insertErr } = await supabase.from("estoque_app").insert(produtos).select();

    if (insertErr) {
      console.error("❌ INSERT_ERR_ESTOQUE (detalhes):", JSON.stringify(insertErr, null, 2));
      console.error("📦 Payload tentado:", JSON.stringify(produtos, null, 2));
      return new Response(
        JSON.stringify({ success: false, error: insertErr, nota_id: finalImagemId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (itensCompra.length > 0) {
      const { error: compraErr } = await supabase.from("itens_compra_app").insert(itensCompra);
      if (compraErr) console.error("⚠️ Erro ao inserir itens_compra_app:", compraErr);
    }

    await supabase.from("notas_imagens").update({ processada: true, updated_at: nowIso() }).eq("id", finalImagemId);

    const totalFinanceiro = inserted.reduce(
      (acc: number, it: any) => acc + it.quantidade * it.preco_unitario_ultimo,
      0
    );

    return new Response(
      JSON.stringify({
        success: true,
        nota_id: finalImagemId,
        itens_do_cupom: itens.length,
        itens_inseridos_estoque: inserted.length,
        total_financeiro: totalFinanceiro.toFixed(2),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Erro geral:", error?.message || error);
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
