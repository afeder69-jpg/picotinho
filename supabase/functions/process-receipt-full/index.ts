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

// ================== EDGE FUNCTION ==================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { notaId } = body || {};

    if (!notaId) {
      return new Response(JSON.stringify({ success: false, error: "ID da nota é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🏁 process-receipt-full START - nota_id=${notaId}`);

    // Buscar nota
    const { data: nota, error: notaError } = await supabase
      .from("notas_imagens")
      .select("id, usuario_id, compra_id, dados_extraidos")
      .eq("id", notaId)
      .single();

    if (notaError || !nota) {
      return new Response(JSON.stringify({ success: false, error: "Nota não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar itens - primeiro tenta itens_nota, depois dados_extraidos
    let itens: any[] = [];
    
    const { data: itensNota, error: itensError } = await supabase
      .from("itens_nota")
      .select("descricao, categoria, quantidade, valor_unitario, unidade, data_compra")
      .eq("nota_id", notaId);

    if (itensNota && itensNota.length > 0) {
      itens = itensNota;
      console.log(`📦 Itens carregados de itens_nota: ${itens.length}`);
    } else {
      // Se não há itens em itens_nota, buscar de dados_extraidos
      if (nota.dados_extraidos?.itens && Array.isArray(nota.dados_extraidos.itens)) {
        itens = nota.dados_extraidos.itens.map((item: any) => ({
          descricao: item.descricao,
          categoria: item.categoria || 'outros',
          quantidade: parseFloat(item.quantidade) || 0,
          valor_unitario: parseFloat(item.valor_unitario) || 0,
          unidade: item.unidade || 'unidade',
          data_compra: nota.dados_extraidos?.compra?.data_emissao ? 
            new Date(nota.dados_extraidos.compra.data_emissao).toISOString().split('T')[0] : 
            new Date().toISOString().split('T')[0]
        }));
        console.log(`📦 Itens carregados de dados_extraidos: ${itens.length}`);
      }
    }

    if (!itens || itens.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Nenhum item encontrado na nota" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limpar estoque anterior dessa nota
    await supabase.from("estoque_app").delete().eq("nota_id", notaId).eq("user_id", nota.usuario_id);

    // Preparar inserts
    const produtosEstoque: any[] = [];
    const itensCompra: any[] = [];

    for (const item of itens) {
      produtosEstoque.push({
        user_id: nota.usuario_id,
        nota_id: nota.id,
        produto_nome: item.descricao,
        categoria: item.categoria,
        quantidade: item.quantidade,
        unidade_medida: item.unidade,
        preco_unitario_ultimo: item.valor_unitario,
        compra_id: nota.compra_id,
        data_compra: item.data_compra, // agora com a data correta da compra
        origem: "nota_fiscal",
      });

      if (nota.compra_id) {
        itensCompra.push({
          compra_id: nota.compra_id,
          produto_nome: item.descricao,
          quantidade: item.quantidade,
          preco_unitario: item.valor_unitario,
          preco_total: item.quantidade * item.valor_unitario,
          data_compra: item.data_compra,
        });
      }
    }

    // Inserir no estoque
    const { data: inserted, error: insertErr } = await supabase.from("estoque_app").insert(produtosEstoque).select();
    if (insertErr) throw new Error(insertErr.message);

    // Inserir em itens_compra_app (se houver compra vinculada)
    if (itensCompra.length > 0) {
      const { error: compraErr } = await supabase.from("itens_compra_app").insert(itensCompra);
      if (compraErr) throw new Error(compraErr.message);
    }

    // Marcar nota como processada
    await supabase.from("notas_imagens").update({ processada: true, updated_at: nowIso() }).eq("id", notaId);

    const totalFinanceiro = inserted.reduce((acc: number, it: any) => acc + it.quantidade * it.preco_unitario_ultimo, 0);

    return new Response(
      JSON.stringify({
        success: true,
        nota_id: notaId,
        itens_inseridos: inserted.length,
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
