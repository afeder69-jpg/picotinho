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

// ================== NORMALIZAR CATEGORIA ==================
function normalizarCategoria(descricao: string, categoriaIa: string): string {
  const texto = (descricao || "").toUpperCase();
  const catIa = (categoriaIa || "").toUpperCase();

  if (/ALHO|CEBOLA|RUCULA|TOMATE|BANANA|MAÇA|HORTIFRUTI|VERDURA|LEGUME|FRUTA|TEMPER[O|OS] VERDE/.test(texto) || catIa.includes("HORTIFRUTI")) {
    return "HORTIFRUTI";
  }
  if (/CARNE|FRANGO|PEITO|FILÉ|FILE|PEIXE|BOVINO|SUINO|SUÍNO|AVES|LINGUIÇA|SALSICHA/.test(texto) || catIa.includes("CARNE")) {
    return "AÇOUGUE";
  }
  if (/LEITE|QUEIJO|IOGURTE|MANTEIGA|MARGARINA|REQUEIJÃO|CREME DE LEITE|FRIOS/.test(texto) || catIa.includes("LATIC")) {
    return "LATICÍNIOS/FRIOS";
  }
  if (/PÃO|BOLO|PADARIA|BISCOITO|SALGADO|TORRADA|ROSQUINHA|CROISSANT/.test(texto) || catIa.includes("PADARIA")) {
    return "PADARIA";
  }
  if (/REFRIGERANTE|SUCO|CERVEJA|VINHO|ÁGUA|ENERGÉTICO|CACHAÇA|WHISKY|VODKA|BEBIDA|CHÁ/.test(texto) || catIa.includes("BEBIDA")) {
    return "BEBIDAS";
  }
  if (/ARROZ|FEIJÃO|MACARRÃO|MASSA|CAFÉ|AÇÚCAR|SAL|ÓLEO|AZEITE|GRÃO|CEREAL|FARINHA|EXTRATO|MOLHO|VINAGRE|AVEIA|OVO/.test(texto) || catIa.includes("MERCEARIA")) {
    return "MERCEARIA";
  }
  if (/DETERGENTE|SABÃO|DESINFETANTE|AMACIANTE|ÁGUA SANITÁRIA|CLORO|LIMPADOR/.test(texto) || catIa.includes("LIMPEZA")) {
    return "LIMPEZA";
  }
  if (/SABONETE|SHAMPOO|CREME DENTAL|PASTA DE DENTE|DESODORANTE|PAPEL HIGIÊNICO|REMÉDIO|MEDICAMENTO|HIGIENE|FARMÁCIA/.test(texto) || catIa.includes("HIGIENE")) {
    return "HIGIENE/FARMÁCIA";
  }
  if (/CONGELADO|SORVETE|PIZZA|NUGGET|HAMBURGUER|PRATO PRONTO/.test(texto) || catIa.includes("CONGELADO")) {
    return "CONGELADOS";
  }
  if (/RAÇÃO|PET|CACHORRO|GATO|AREIA DE GATO|BRINQUEDO PET|COLEIRA/.test(texto) || catIa.includes("PET")) {
    return "PET";
  }

  return "OUTROS";
}

// Buscar ou criar produto no catálogo
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

// ================== EDGE FUNCTION ==================
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

    // Consolidar itens iguais
    const mapaConsolidado = new Map<string, any>();

    for (const raw of itens) {
      const descricaoOriginal = pickDescricao(raw);
      const descricaoNormalizada = normalizar(descricaoOriginal) || descricaoOriginal.toUpperCase();
      const quantidade = pickQuantidade(raw);
      const valorUnitario = pickValorUnitario(raw);
      const unidade = pickUnidade(raw);
      const categoriaIa = pickCategoria(raw);
      const categoria = normalizarCategoria(descricaoOriginal, categoriaIa);

      if (quantidade === null || valorUnitario === null) continue;

      const chave = `${descricaoNormalizada}__${unidade}`;
      if (!mapaConsolidado.has(chave)) {
        mapaConsolidado.set(chave, {
          descricaoOriginal,
          descricaoNormalizada,
          quantidade,
          valorUnitario,
          unidade,
          categoria,
        });
      } else {
        const existente = mapaConsolidado.get(chave)!;
        existente.quantidade += quantidade;
        existente.valorUnitario = valorUnitario;
      }
    }

    const itensConsolidados = Array.from(mapaConsolidado.values());
    console.log(`📦 Itens consolidados: ${itensConsolidados.length}`);

    await supabase.from("estoque_app").delete().eq("nota_id", notaImagem.id).eq("user_id", notaImagem.usuario_id);

    const produtos: any[] = [];
    const itensCompra: any[] = [];

    for (const item of itensConsolidados) {
      const produtoId = await buscarOuCriarProduto(supabase, item.descricaoNormalizada, item.categoria, item.unidade);

      produtos.push({
        user_id: notaImagem.usuario_id,
        nota_id: notaImagem.id,
        produto_nome: item.descricaoNormalizada,
        categoria: item.categoria,
        quantidade: item.quantidade,
        unidade_medida: item.unidade,
        preco_unitario_ultimo: item.valorUnitario,
        compra_id: notaImagem.compra_id,
        origem: "nota_fiscal",
      });

      if (notaImagem.compra_id) {
        itensCompra.push({
          compra_id: notaImagem.compra_id,
          produto_id: produtoId,
          quantidade: item.quantidade,
          preco_unitario: item.valorUnitario,
          preco_total: item.quantidade * item.valorUnitario,
        });
      }
    }

    const { data: inserted, error: insertErr } = await supabase.from("estoque_app").insert(produtos).select();
    if (insertErr) throw new Error(insertErr.message);

    if (itensCompra.length > 0) {
      await supabase.from("itens_compra_app").insert(itensCompra);
    }

    await supabase.from("notas_imagens").update({ processada: true, updated_at: nowIso() }).eq("id", finalImagemId);

    const totalFinanceiro = inserted.reduce((acc: number, it: any) => acc + it.quantidade * it.preco_unitario_ultimo, 0);

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
