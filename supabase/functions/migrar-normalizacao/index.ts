import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { batch_size = 100, offset = 0, source_table = 'estoque_app' } = await req.json().catch(() => ({}));
    
    console.log(`🚀 Iniciando backfill - batch_size: ${batch_size}, offset: ${offset}, source: ${source_table}`);
    
    const startTime = Date.now();
    let processados = 0;
    let autoAssociados = 0;
    let propostos = 0;
    let novos = 0;
    let erros = 0;
    
    // Buscar produtos únicos do estoque que ainda não foram normalizados
    let query;
    if (source_table === 'estoque_app') {
      query = supabase
        .from('estoque_app')
        .select('produto_nome, user_id')
        .not('produto_nome', 'is', null)
        .range(offset, offset + batch_size - 1);
    } else if (source_table === 'notas_imagens') {
      // Buscar de dados extraídos das notas
      query = supabase
        .from('notas_imagens')
        .select('id, dados_extraidos, usuario_id')
        .eq('processada', true)
        .not('dados_extraidos', 'is', null)
        .range(offset, offset + batch_size - 1);
    } else {
      throw new Error('Fonte não suportada');
    }
    
    const { data: produtos, error } = await query;
    
    if (error) {
      throw error;
    }
    
    if (!produtos || produtos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhum produto encontrado para processar',
          stats: { processados, autoAssociados, propostos, novos, erros },
          tempoProcessamento: Date.now() - startTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Processar cada produto
    for (const item of produtos) {
      let produtosParaNormalizar: string[] = [];
      
      if (source_table === 'estoque_app') {
        produtosParaNormalizar = [item.produto_nome];
      } else if (source_table === 'notas_imagens') {
        // Extrair produtos dos dados da nota
        if (item.dados_extraidos?.itens && Array.isArray(item.dados_extraidos.itens)) {
          produtosParaNormalizar = item.dados_extraidos.itens
            .filter((produto: any) => produto.descricao)
            .map((produto: any) => produto.descricao);
        }
      }
      
      for (const produtoNome of produtosParaNormalizar) {
        try {
          // Verificar se já existe sinônimo para este produto
          const { data: sinonimoExistente } = await supabase
            .from('sinonimos_produtos')
            .select('id')
            .eq('texto_origem', produtoNome)
            .limit(1);
          
          if (sinonimoExistente && sinonimoExistente.length > 0) {
            console.log(`⏭️ Produto já normalizado: ${produtoNome}`);
            continue;
          }
          
          // Chamar a função de normalização
          const response = await supabase.functions.invoke('normalizar-produto', {
            body: {
              texto_origem: produtoNome,
              fonte: `backfill_${source_table}`,
              meta: {
                batch_id: `${offset}-${batch_size}`,
                source_id: source_table === 'estoque_app' ? item.user_id : item.id
              }
            }
          });
          
          if (response.error) {
            console.error(`❌ Erro na normalização de "${produtoNome}":`, response.error);
            erros++;
            continue;
          }
          
          const resultado = response.data;
          
          // Contar estatísticas
          switch (resultado.acao) {
            case 'auto_associado':
              autoAssociados++;
              console.log(`✅ Auto-associado: ${produtoNome} -> ${resultado.sku}`);
              break;
            case 'proposto':
              propostos++;
              console.log(`🤔 Proposto para revisão: ${produtoNome} (score: ${resultado.score})`);
              break;
            case 'novo_provisorio':
              novos++;
              console.log(`🆕 Novo produto criado: ${produtoNome} -> ${resultado.sku}`);
              break;
            default:
              console.log(`❓ Ação desconhecida: ${resultado.acao} para ${produtoNome}`);
          }
          
          processados++;
          
          // Pequeno delay para não sobrecarregar a API
          if (processados % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (error) {
          console.error(`❌ Erro ao processar produto "${produtoNome}":`, error);
          erros++;
        }
      }
    }
    
    const tempoProcessamento = Date.now() - startTime;
    const taxaAutoAssociacao = processados > 0 ? (autoAssociados / processados * 100).toFixed(1) : 0;
    
    // Atualizar estatísticas
    try {
      await supabase.rpc('refresh_stats_normalizacao');
    } catch (error) {
      console.warn('Erro ao atualizar estatísticas:', error);
    }
    
    const relatorio = {
      success: true,
      batch_info: {
        batch_size,
        offset,
        source_table,
        items_encontrados: produtos.length
      },
      stats: {
        processados,
        autoAssociados,
        propostos,
        novos,
        erros,
        taxaAutoAssociacao: `${taxaAutoAssociacao}%`
      },
      performance: {
        tempoProcessamento,
        itensPerSegundo: processados > 0 ? Math.round(processados / (tempoProcessamento / 1000)) : 0
      },
      proxima_execucao: {
        proximo_offset: offset + batch_size,
        continuar: produtos.length === batch_size
      }
    };
    
    console.log(`📊 Backfill concluído:`, relatorio);
    
    return new Response(
      JSON.stringify(relatorio),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('❌ Erro no backfill:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Erro interno no backfill',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});