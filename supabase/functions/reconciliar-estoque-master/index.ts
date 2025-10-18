// =====================================
// FASE 4: JOB DE RECONCILIAÇÃO AUTOMÁTICA
// =====================================
// Este edge function roda periodicamente (a cada 6 horas) para:
// 1. Buscar produtos sem sku_global no estoque
// 2. Tentar encontrar master correspondente
// 3. Atualizar automaticamente se encontrar match (threshold 85%)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('🔄 Iniciando reconciliação de estoque com produtos master...');
    
    // 1️⃣ Buscar produtos sem normalizar (limite 100 por vez para evitar timeout)
    const { data: produtosSemMaster, error: fetchError } = await supabase
      .from('estoque_app')
      .select('id, produto_nome, categoria, user_id')
      .is('sku_global', null)
      .limit(100);
    
    if (fetchError) {
      throw new Error(`Erro ao buscar produtos: ${fetchError.message}`);
    }
    
    if (!produtosSemMaster || produtosSemMaster.length === 0) {
      console.log('✅ Nenhum produto pendente de normalização');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhum produto pendente de normalização',
          produtos_processados: 0,
          atualizados: 0,
          nao_encontrados: 0
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`📊 Encontrados ${produtosSemMaster.length} produtos sem master`);
    
    let atualizados = 0;
    let naoEncontrados = 0;
    const erros: string[] = [];
    
    // 2️⃣ Processar cada produto
    for (const produto of produtosSemMaster) {
      try {
        // Buscar masters da mesma categoria
        const { data: masters, error: masterError } = await supabase
          .from('produtos_master_global')
          .select('*')
          .eq('categoria', produto.categoria)
          .eq('status', 'ativo')
          .limit(10);
        
        if (masterError || !masters || masters.length === 0) {
          naoEncontrados++;
          continue;
        }
        
        // 3️⃣ Calcular similaridade e encontrar melhor match
        let melhorMatch = null;
        let melhorScore = 0;
        
        for (const master of masters) {
          const score = calcularSimilaridadeSimples(
            produto.produto_nome.toUpperCase(),
            master.nome_padrao.toUpperCase()
          );
          
          // Threshold: 85% de similaridade mínima
          if (score > melhorScore && score >= 0.85) {
            melhorScore = score;
            melhorMatch = master;
          }
        }
        
        if (melhorMatch) {
          // 4️⃣ Atualizar produto com master encontrado
          const { error: updateError } = await supabase
            .from('estoque_app')
            .update({
              sku_global: melhorMatch.sku_global,
              produto_master_id: melhorMatch.id,
              produto_nome: melhorMatch.nome_padrao,
              marca: melhorMatch.marca,
              produto_nome_normalizado: melhorMatch.nome_padrao,
              nome_base: melhorMatch.nome_base,
              updated_at: new Date().toISOString()
            })
            .eq('id', produto.id);
          
          if (!updateError) {
            atualizados++;
            console.log(`✅ ${produto.produto_nome} → ${melhorMatch.nome_padrao} (${(melhorScore * 100).toFixed(0)}%)`);
          } else {
            erros.push(`Erro ao atualizar ${produto.produto_nome}: ${updateError.message}`);
            naoEncontrados++;
          }
        } else {
          naoEncontrados++;
          console.log(`⚠️ Sem match: ${produto.produto_nome} (melhor score: ${(melhorScore * 100).toFixed(0)}%)`);
        }
        
      } catch (error: any) {
        console.error(`❌ Erro ao processar ${produto.produto_nome}:`, error.message);
        erros.push(`${produto.produto_nome}: ${error.message}`);
        naoEncontrados++;
      }
    }
    
    console.log(`✅ Reconciliação concluída: ${atualizados} atualizados, ${naoEncontrados} sem master`);
    
    if (erros.length > 0) {
      console.warn(`⚠️ Erros encontrados (${erros.length}):`, erros.slice(0, 5));
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        produtos_processados: produtosSemMaster.length,
        atualizados,
        nao_encontrados: naoEncontrados,
        taxa_normalizacao: produtosSemMaster.length > 0 
          ? `${((atualizados / produtosSemMaster.length) * 100).toFixed(1)}%`
          : '0%',
        erros: erros.length > 0 ? erros.slice(0, 10) : undefined
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: any) {
    console.error("❌ Erro geral na reconciliação:", error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ================== HELPER: SIMILARIDADE SIMPLIFICADA ==================
// Calcula similaridade entre dois textos baseado em palavras comuns
function calcularSimilaridadeSimples(s1: string, s2: string): number {
  // Remover palavras muito curtas (< 3 caracteres)
  const palavras1 = s1.split(' ').filter(p => p.length >= 3);
  const palavras2 = s2.split(' ').filter(p => p.length >= 3);
  
  if (palavras1.length === 0 || palavras2.length === 0) {
    return 0;
  }
  
  let matches = 0;
  
  // Contar palavras que aparecem em ambos
  for (const p1 of palavras1) {
    for (const p2 of palavras2) {
      // Match exato
      if (p1 === p2) {
        matches++;
        break;
      }
      // Match parcial (uma palavra contém a outra)
      if (p1.includes(p2) || p2.includes(p1)) {
        matches += 0.7; // Peso menor para match parcial
        break;
      }
    }
  }
  
  // Normalizar pelo número de palavras
  const maxPalavras = Math.max(palavras1.length, palavras2.length);
  return matches / maxPalavras;
}
