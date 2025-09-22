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
    const { notaId, imagemId } = body || {};
    
    // Aceitar tanto notaId quanto imagemId para compatibilidade
    const finalNotaId = notaId || imagemId;

    if (!finalNotaId) {
      return new Response(JSON.stringify({ success: false, error: "ID da nota é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🏁 process-receipt-full START - nota_id=${finalNotaId}`);

    // Buscar nota
    const { data: nota, error: notaError } = await supabase
      .from("notas_imagens")
      .select("id, usuario_id, compra_id, dados_extraidos")
      .eq("id", finalNotaId)
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
      .eq("nota_id", finalNotaId);

    if (itensNota && itensNota.length > 0) {
      itens = itensNota;
      console.log(`📦 Itens carregados de itens_nota: ${itens.length}`);
    } else {
      // Se não há itens em itens_nota, buscar de dados_extraidos
      if (nota.dados_extraidos?.itens && Array.isArray(nota.dados_extraidos.itens)) {
        const dataCompra = nota.dados_extraidos?.compra?.data_emissao || 
                          nota.dados_extraidos?.data_emissao ||
                          new Date().toISOString().split('T')[0];
        
        itens = nota.dados_extraidos.itens.map((item: any) => ({
          descricao: item.descricao,
          categoria: item.categoria || 'outros',
          quantidade: parseFloat(item.quantidade) || 0,
          valor_unitario: parseFloat(item.valor_unitario) || 0,
          unidade: item.unidade || 'unidade',
          data_compra: dataCompra
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
    await supabase.from("estoque_app").delete().eq("nota_id", finalNotaId).eq("user_id", nota.usuario_id);

    // Consolidar itens duplicados antes de inserir no estoque
    const produtosConsolidados = new Map<string, any>();
    
    for (const item of itens) {
      const key = item.descricao; // usar descrição como chave para consolidar
      
      if (produtosConsolidados.has(key)) {
        // Item já existe, somar quantidades
        const itemExistente = produtosConsolidados.get(key);
        itemExistente.quantidade += item.quantidade;
        // Manter o preço unitário mais recente (último item)
        itemExistente.preco_unitario_ultimo = item.valor_unitario;
      } else {
        // Novo item
        produtosConsolidados.set(key, {
          user_id: nota.usuario_id,
          nota_id: nota.id,
          produto_nome: item.descricao,
          categoria: item.categoria || 'outros',
          quantidade: item.quantidade,
          unidade_medida: item.unidade || 'unidade',
          preco_unitario_ultimo: item.valor_unitario,
          compra_id: nota.compra_id,
          origem: "nota_fiscal",
        });
      }
    }

    // Converter Map para Array
    const produtosEstoque = Array.from(produtosConsolidados.values());
    
    console.log(`📦 Itens únicos para inserir no estoque: ${produtosEstoque.length} (de ${itens.length} itens originais)`);
    
    // 🚨 DEBUG CRÍTICO: Verificar se os produtos problemáticos estão na lista
    const produtosProblematicos = ['Queijo Parmesão President', 'Filé de Peito de Frango', 'Creme de Leite Italac', 'Requeijão Cremoso Tirolez'];
    
    console.log('🔍 AUDITORIA DOS PRODUTOS PROBLEMÁTICOS:');
    produtosProblematicos.forEach(produtoTeste => {
      const encontrado = produtosEstoque.find(p => p.produto_nome.includes(produtoTeste.split(' ')[0]));
      if (encontrado) {
        console.log(`✅ ${produtoTeste}: ENCONTRADO - ${encontrado.produto_nome} | Cat: ${encontrado.categoria} | Qtd: ${encontrado.quantidade}`);
      } else {
        console.log(`❌ ${produtoTeste}: NÃO ENCONTRADO na lista de inserção!`);
      }
    });
    
    // Mostrar todos os produtos que vão ser inseridos
    console.log('📋 Lista completa para inserção:');
    produtosEstoque.forEach((produto, index) => {
      console.log(`${index + 1}. ${produto.produto_nome} | Cat: ${produto.categoria} | Qtd: ${produto.quantidade} | Preço: ${produto.preco_unitario_ultimo}`);
    });

    // Inserir no estoque
    const { data: inserted, error: insertErr } = await supabase.from("estoque_app").insert(produtosEstoque).select();
    if (insertErr) throw new Error(insertErr.message);

    console.log(`✅ ${inserted.length} itens inseridos no estoque`);
    
    // 🚨 VALIDAÇÃO CRÍTICA: Verificar se todos os itens foram inseridos corretamente
    const itensEsperados = produtosEstoque.length;
    const itensInseridos = inserted.length;
    
    if (itensInseridos !== itensEsperados) {
      console.error(`🚨 INCONSISTÊNCIA CRÍTICA: Esperado ${itensEsperados} itens, inserido ${itensInseridos}`);
      console.error('🚨 Produtos que deveriam ser inseridos:', produtosEstoque.map(p => p.produto_nome));
      console.error('🚨 Produtos efetivamente inseridos:', inserted.map(p => p.produto_nome));
    } else {
      console.log('✅ Validação OK: Todos os itens foram inseridos corretamente');
    }

    // Marcar nota como processada
    await supabase.from("notas_imagens").update({ processada: true, updated_at: nowIso() }).eq("id", finalNotaId);

    const totalFinanceiro = inserted.reduce((acc: number, it: any) => acc + it.quantidade * it.preco_unitario_ultimo, 0);

    return new Response(
      JSON.stringify({
        success: true,
        nota_id: finalNotaId,
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
