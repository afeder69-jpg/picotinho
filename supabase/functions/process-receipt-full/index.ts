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

// Função de normalização completa
function normalizar(texto: string): string {
  if (!texto) return "";
  
  return texto
    .normalize("NFD") // Remove acentos
    .replace(/[\u0300-\u036f]/g, "") // Remove marcas diacríticas
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ") // Remove caracteres especiais, mantém letras, números e espaços
    .replace(/\s+/g, " ") // Múltiplos espaços vira um
    .trim();
}

// Converte números no padrão BR e mistos ("1.000,00", "2,48", "0.435", 3.69)
function parseNumberBR(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;

  // Casos:
  //  - "1.000,50" -> "1000.50"
  //  - "2,48"     -> "2.48"
  //  - "0.435"    -> "0.435"
  //  - "3.69"     -> "3.69"
  // Remover espaços, remover separador de milhar ".", trocar vírgula decimal por ponto
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
  return s; // fallback
}

// Safe pick com fallback entre alias comuns usados pela IA-2
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
  const cand = item?.quantidade ?? item?.qtd_valor ?? item?.qtd ?? item?.qtdValor;
  return parseNumberBR(cand);
}
function pickValorUnitario(item: any): number | null {
  const cand =
    item?.valor_unitario ?? item?.precoUnitario ?? item?.preco_unitario ?? item?.valorUnit;
  return parseNumberBR(cand);
}
function pickUnidade(item: any): string {
  const cand = item?.unidade ?? item?.qtd_unidade ?? item?.unid ?? item?.unidade_medida;
  return normUnidade(cand);
}
function pickCategoria(item: any): string {
  const c = String(item?.categoria ?? "OUTROS").trim().toUpperCase();
  return c;
}

// Função para buscar ou criar produto no catálogo único
async function buscarOuCriarProduto(supabase: any, descricaoNormalizada: string, categoria: string, unidadeMedida: string) {
  console.log(`🔍 Buscando produto: "${descricaoNormalizada}"`);
  
  // 1. Buscar produto existente por nome normalizado
  const { data: produtoExistente } = await supabase
    .from("produtos_app")
    .select("id, nome")
    .eq("nome", descricaoNormalizada)
    .single();

  if (produtoExistente) {
    console.log(`✅ Produto encontrado: ${produtoExistente.id} - ${produtoExistente.nome}`);
    return produtoExistente.id;
  }

  // 2. Criar novo produto no catálogo
  console.log(`🆕 Criando novo produto: "${descricaoNormalizada}"`);
  
  const { data: novoProduto, error: erroProduto } = await supabase
    .from("produtos_app")
    .insert({
      nome: descricaoNormalizada,
      categoria_id: null, // Por enquanto sem categoria específica
      unidade_medida: unidadeMedida,
      ativo: true,
      descricao: `Produto criado automaticamente: ${descricaoNormalizada}`
    })
    .select("id")
    .single();

  if (erroProduto) {
    console.error(`❌ Erro ao criar produto: ${erroProduto.message}`);
    throw new Error(`Erro ao criar produto: ${erroProduto.message}`);
  }

  console.log(`✅ Novo produto criado: ${novoProduto.id} - ${descricaoNormalizada}`);
  return novoProduto.id;
}

// ================== EDGE FUNCTION ==================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = nowIso();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ------- Entrada -------
    const body = await req.json().catch(() => ({}));
    const { imagemId, notaImagemId } = body || {};
    const finalImagemId: string | null = imagemId || notaImagemId || null;

    if (!finalImagemId) {
      return new Response(
        JSON.stringify({ success: false, error: "ID da imagem é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🏁 [${startedAt}] process-receipt-full START - nota_id=${finalImagemId}`);

    // ------- Carregar nota + dados extraídos -------
    const { data: notaImagem, error: notaError } = await supabase
      .from("notas_imagens")
      .select("id, dados_extraidos, processada, usuario_id, compra_id, created_at")
      .eq("id", finalImagemId)
      .single();

    if (notaError || !notaImagem) {
      console.log(`❌ Nota não encontrada: ${notaError?.message}`);
      return new Response(
        JSON.stringify({ success: false, error: "Nota não encontrada", nota_id: finalImagemId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!notaImagem.dados_extraidos || !Array.isArray(notaImagem.dados_extraidos?.itens)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nota sem itens extraídos (dados_extraidos.itens ausente)",
          nota_id: finalImagemId,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const itens: any[] = notaImagem.dados_extraidos.itens;
    if (itens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum item encontrado na nota", nota_id: finalImagemId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 Nota encontrada (user=${notaImagem.usuario_id}, compra_id=${notaImagem.compra_id})`);
    console.log(`🧾 Itens no cuponzinho: ${itens.length}`);

    // ------- Detectar se estoque_app possui coluna nota_id (para idempotência perfeita) -------
    let supportsNotaId = true;
    {
      const test = await supabase.from("estoque_app").select("nota_id").limit(1);
      if (test.error) {
        supportsNotaId = false;
        console.log("ℹ️ estoque_app.nota_id NÃO existe. Recomendo adicionar a coluna para idempotência perfeita.");
      }
    }

    // ------- Processar itens com normalização e SKU único -------
    const produtos: any[] = [];
    const itensCompra: any[] = [];
    const rejeitados: any[] = [];
    const produtosNovos: string[] = [];

    for (const raw of itens) {
      const descricaoOriginal = pickDescricao(raw);
      const quantidade = pickQuantidade(raw);
      const valorUnitario = pickValorUnitario(raw);
      const unidade_medida = pickUnidade(raw);
      const categoria = pickCategoria(raw);

      if (quantidade === null || valorUnitario === null) {
        rejeitados.push({
          descricao: descricaoOriginal,
          qtdRaw: raw?.quantidade ?? raw?.qtd_valor ?? raw?.qtd ?? raw?.qtdValor,
          valRaw: raw?.valor_unitario ?? raw?.precoUnitario ?? raw?.preco_unitario ?? raw?.valorUnit,
          observacao: "Quantidade/valor inválidos após parsing",
        });
        continue;
      }

      // 1. FORÇAR normalização (nunca NULL)
      const descricaoNormalizada = normalizar(descricaoOriginal) || descricaoOriginal.toUpperCase();
      
      try {
        // 2. Buscar/criar produto no catálogo único
        const produtoId = await buscarOuCriarProduto(supabase, descricaoNormalizada, categoria, unidade_medida);
        
        // Track se é produto novo
        if (!produtosNovos.includes(descricaoNormalizada)) {
          produtosNovos.push(descricaoNormalizada);
        }
        
        // 3. Inserir em itens_nota (com descricao_normalizada sempre preenchida)
        const { data: itemNota, error: erroItemNota } = await supabase
          .from("itens_nota")
          .insert({
            nota_id: notaImagem.id,
            descricao: descricaoOriginal,
            descricao_normalizada: descricaoNormalizada,
            produto_normalizado_id: produtoId,
            quantidade,
            valor_unitario: valorUnitario,
            valor_total: quantidade * valorUnitario,
            unidade: unidade_medida,
            categoria
          })
          .select("id")
          .single();

        if (erroItemNota) {
          console.warn(`⚠️ Erro ao inserir item_nota: ${erroItemNota.message}`);
        }

        // 4. Preparar para itens_compra_app (se há compra_id)
        if (notaImagem.compra_id) {
          itensCompra.push({
            compra_id: notaImagem.compra_id,
            produto_id: produtoId,
            quantidade,
            preco_unitario: valorUnitario,
            preco_total: quantidade * valorUnitario,
            observacoes: `Item da nota ${notaImagem.id}`
          });
        }

        // 5. Preparar para estoque_app (compatibilidade)
        const baseEstoque = {
          user_id: notaImagem.usuario_id,
          produto_nome: descricaoNormalizada, // Usar nome normalizado
          categoria,
          quantidade,
          unidade_medida,
          preco_unitario_ultimo: valorUnitario,
          compra_id: notaImagem.compra_id,
          origem: "nota_fiscal",
          // Campos da normalização
          produto_nome_normalizado: descricaoNormalizada,
          nome_base: descricaoNormalizada,
          marca: null,
          tipo_embalagem: null,
          qtd_valor: null,
          qtd_unidade: null,
          qtd_base: null,
          granel: false,
          produto_hash_normalizado: null
        };

        if (supportsNotaId) {
          produtos.push({ ...baseEstoque, nota_id: notaImagem.id });
        } else {
          produtos.push(baseEstoque);
        }

        console.log(`✅ Processado: "${descricaoOriginal}" -> "${descricaoNormalizada}" (SKU: ${produtoId})`);

      } catch (error: any) {
        console.error(`❌ Erro ao processar item "${descricaoOriginal}": ${error.message}`);
        rejeitados.push({
          descricao: descricaoOriginal,
          observacao: `Erro ao processar: ${error.message}`
        });
      }
    }

    console.log(`✅ Preparados ${produtos.length} itens para estoque. Rejeitados: ${rejeitados.length}`);
    console.log(`🛒 Preparados ${itensCompra.length} itens para compra.`);
    if (rejeitados.length) console.log("⚠️ Rejeitados (amostra):", JSON.stringify(rejeitados.slice(0, 3), null, 2));

    if (produtos.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Todos os itens foram rejeitados (quantidade/valor inválidos).",
          nota_id: finalImagemId,
          rejeitados,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------- Idempotência por nota: apagar antes de inserir (apenas os itens dessa nota) -------
    if (supportsNotaId) {
      const { error: delErr } = await supabase
        .from("estoque_app")
        .delete()
        .eq("user_id", notaImagem.usuario_id)
        .eq("nota_id", notaImagem.id);

      if (delErr) {
        console.log("⚠️ Erro ao limpar itens da mesma nota (pode prosseguir):", delErr.message);
      } else {
        console.log("🧹 Limpeza idempotente: removidos itens anteriores dessa nota (se havia).");
      }
    } else {
      console.log(
        "ℹ️ Sem coluna nota_id: não é possível apagar idempotentemente os itens dessa nota. Recomenda-se criar a coluna."
      );
    }

    // ------- Insert estoque em lote -------
    const { data: inserted, error: insertErr } = await supabase
      .from("estoque_app")
      .insert(produtos)
      .select();

    if (insertErr) {
      console.error("❌ INSERT_ERR_ESTOQUE:", insertErr);
      return new Response(
        JSON.stringify({ success: false, error: insertErr.message, nota_id: finalImagemId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------- Insert itens_compra_app (se há compra) -------
    let itensCompraInseridos = 0;
    if (itensCompra.length > 0) {
      const { data: compraInserted, error: compraErr } = await supabase
        .from("itens_compra_app")
        .insert(itensCompra)
        .select();

      if (compraErr) {
        console.warn(`⚠️ Erro ao inserir itens_compra_app: ${compraErr.message}`);
      } else {
        itensCompraInseridos = compraInserted?.length || 0;
        console.log(`🛒 ${itensCompraInseridos} itens inseridos em itens_compra_app`);
      }
    }

    // ------- Marcar como processada (informativo) -------
    // Não bloqueamos reprocesso por aqui — IA-1 cuida de duplicidade pela chave de 44 dígitos.
    await supabase
      .from("notas_imagens")
      .update({ processada: true, updated_at: nowIso() })
      .eq("id", finalImagemId);

    // ------- Log financeiro para conferência -------
    const totalInserido = inserted.reduce((acc: number, it: any) => acc + Number(it.quantidade) * Number(it.preco_unitario_ultimo), 0);
    console.log(`💰 Total inserido (somatório qtd*unit): ${totalInserido.toFixed(2)} - itens: ${inserted.length}`);
    console.log(`📊 Resumo: ${inserted.length} estoque + ${itensCompraInseridos} compra + ${rejeitados.length} rejeitados`);

    return new Response(
      JSON.stringify({
        success: true,
        nota_id: finalImagemId,
        itens_do_cupom: itens.length,
        itens_inseridos_estoque: inserted.length,
        itens_inseridos_compra: itensCompraInseridos,
        rejeitados: rejeitados.length,
        total_financeiro: totalInserido,
        produtos_novos_criados: produtosNovos.length,
        aviso: supportsNotaId ? null : "Recomendo adicionar a coluna 'nota_id' em estoque_app para idempotência perfeita.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Erro geral:", error?.message || error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
