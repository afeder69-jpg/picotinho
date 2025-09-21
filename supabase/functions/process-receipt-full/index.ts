// supabase/functions/process-receipt-full/index.ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

// ================== CONFIG CORS ==================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ================== HELPERS ==================
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
  return "UN"; // fallback final
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
  const c = String(item?.categoria ?? "").trim().toUpperCase();
  return c || "OUTROS";
}

// ================== EDGE FUNCTION ==================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    // Consolidar itens iguais
    const mapa = new Map<string, any>();
    for (const raw of itens) {
      const descricao = pickDescricao(raw);
      const normalizada = normalizar(descricao) || descricao.toUpperCase();
      const quantidade = pickQuantidade(raw);
      const valorUnit = pickValorUnitario(raw);
      const unidade = pickUnidade(raw);
      const categoria = pickCategoria(raw);

      if (quantidade === null || valorUnit === null) continue;

      const chave = `${normalizada}__${unidade}`;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          descricaoOriginal: descricao,
          descricaoNormalizada: normalizada,
          quantidade,
          valorUnitario: valorUnit,
          unidade,
          categoria,
        });
      } else {
        const existente = mapa.get(chave)!;
        existente.quantidade += quantidade;
        existente.valorUnitario = valorUnit;
      }
    }

    const itensConsolidados = Array.from(mapa.values());
    console.log(`📦 Itens consolidados: ${itensConsolidados.length}`);

    if (itensConsolidados.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Todos os itens inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limpar itens antigos da nota
    await supabase.from("estoque_app").delete().eq("nota_id", notaImagem.id).eq("user_id", notaImagem.usuario_id);

    // Inserir estoque
    const produtos = itensConsolidados.map((it) => ({
      user_id: notaImagem.usuario_id,
      nota_id: notaImagem.id,
      produto_nome: it.descricaoNormalizada,
      categoria: it.categoria || "OUTROS",
      quantidade: it.quantidade,
      unidade_medida: it.unidade || "UN",
      preco_unitario_ultimo: it.valorUnitario,
      compra_id: notaImagem.compra_id,
      origem: "nota_fiscal",
    }));

    console.log("📥 Preparando para insert no estoque_app:", JSON.stringify(produtos, null, 2));

    const { data: inserted, error: insertErr } = await supabase.from("estoque_app").insert(produtos).select();

    if (insertErr) {
      console.error("❌ INSERT_ERR_ESTOQUE:", insertErr);
      return new Response(JSON.stringify({ success: false, error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
