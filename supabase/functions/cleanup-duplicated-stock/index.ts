import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { userId } = body || {};

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "User ID é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🧹 Limpando duplicados no estoque do usuário: ${userId}`);

    // 1. Deletar produtos com quantidade = 0 (de notas antigas)
    const { error: deleteZeroError } = await supabase
      .from("estoque_app")
      .delete()
      .eq("user_id", userId)
      .eq("quantidade", 0);

    if (deleteZeroError) throw deleteZeroError;
    
    console.log("✅ Produtos com quantidade zero removidos");

    // 2. Buscar produtos duplicados (mesmo nome)
    const { data: duplicates, error: duplicatesError } = await supabase
      .from("estoque_app")
      .select("produto_nome, id, quantidade, preco_unitario_ultimo, created_at")
      .eq("user_id", userId)
      .order("produto_nome, created_at");

    if (duplicatesError) throw duplicatesError;

    // 3. Agrupar por nome e consolidar
    const productGroups = new Map<string, any[]>();
    
    for (const product of duplicates) {
      const key = product.produto_nome;
      if (!productGroups.has(key)) {
        productGroups.set(key, []);
      }
      productGroups.get(key)!.push(product);
    }

    let consolidated = 0;
    let duplicatesRemoved = 0;

    // 4. Para cada grupo com duplicados, consolidar
    for (const [productName, products] of productGroups) {
      if (products.length > 1) {
        // Ordenar por data de criação (mais recente primeiro)
        products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        // Manter o mais recente e somar quantidades
        const mainProduct = products[0];
        const totalQuantity = products.reduce((sum, p) => sum + p.quantidade, 0);
        
        // Atualizar o produto principal com quantidade consolidada
        const { error: updateError } = await supabase
          .from("estoque_app")
          .update({ quantidade: totalQuantity })
          .eq("id", mainProduct.id);

        if (updateError) throw updateError;

        // Deletar os duplicados
        const duplicateIds = products.slice(1).map(p => p.id);
        if (duplicateIds.length > 0) {
          const { error: deleteError } = await supabase
            .from("estoque_app")
            .delete()
            .in("id", duplicateIds);

          if (deleteError) throw deleteError;
          
          duplicatesRemoved += duplicateIds.length;
          consolidated++;
          
          console.log(`📦 Consolidado ${productName}: ${duplicateIds.length} duplicados removidos, quantidade total: ${totalQuantity}`);
        }
      }
    }

    // 5. Contar produtos finais
    const { data: finalCount, error: countError } = await supabase
      .from("estoque_app")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (countError) throw countError;

    console.log(`🎯 Limpeza concluída: ${consolidated} produtos consolidados, ${duplicatesRemoved} duplicados removidos`);

    return new Response(
      JSON.stringify({
        success: true,
        produtos_consolidados: consolidated,
        duplicados_removidos: duplicatesRemoved,
        total_produtos_final: finalCount?.length || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Erro na limpeza:", error?.message || error);
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});