import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase não configurado corretamente');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Iniciando recategorização de produtos em "outros"...');

    // Buscar todos os produtos na categoria "outros"
    const { data: produtosOutros, error: errorBusca } = await supabase
      .from('estoque_app')
      .select('id, produto_nome, categoria, user_id')
      .eq('categoria', 'outros');

    if (errorBusca) {
      throw new Error(`Erro ao buscar produtos: ${errorBusca.message}`);
    }

    console.log(`📦 Encontrados ${produtosOutros?.length || 0} produtos na categoria "outros"`);

    let produtosRecategorizados = 0;
    let produtosMantidos = 0;
    const detalhesRecategorizacao = [];

    // Definir regras de categorização direta (mais eficiente)
    const regrasCategorização = {
      'hortifruti': [
        'tempero verde', 'cheiro verde', 'salsa', 'cebolinha', 'manjericão', 'coentro',
        'alface', 'tomate', 'cebola', 'batata', 'cenoura', 'abobrinha', 'beterraba'
      ],
      'mercearia': [
        'milho verde', 'milho', 'massa', 'macarrão', 'sal', 'sal refinado', 'aveia', 
        'azeite', 'ovos', 'ovos brancos', 'arroz', 'feijão', 'açúcar', 'café', 'óleo',
        'farinha', 'molho', 'vinagre', 'extrato'
      ],
      'limpeza': [
        'esponja', 'esponja de aço', 'bombril', 'detergente', 'sabão', 'desinfetante',
        'água sanitária', 'amaciante', 'alvejante', 'palha de aço'
      ]
    };

    // Processar cada produto
    for (const produto of produtosOutros || []) {
      const nomeProduto = produto.produto_nome.toLowerCase();
      let novaCategoria = 'outros';

      // Aplicar regras de categorização
      for (const [categoria, palavrasChave] of Object.entries(regrasCategorização)) {
        if (palavrasChave.some(palavra => nomeProduto.includes(palavra))) {
          novaCategoria = categoria;
          break;
        }
      }

      if (novaCategoria !== 'outros') {
        // Atualizar categoria no banco
        const { error: errorUpdate } = await supabase
          .from('estoque_app')
          .update({ categoria: novaCategoria })
          .eq('id', produto.id);

        if (errorUpdate) {
          console.error(`❌ Erro ao atualizar produto ${produto.produto_nome}:`, errorUpdate);
        } else {
          produtosRecategorizados++;
          detalhesRecategorizacao.push({
            produto: produto.produto_nome,
            categoriaAnterior: 'outros',
            categoriaNova: novaCategoria
          });
          console.log(`✅ ${produto.produto_nome} → ${novaCategoria}`);
        }
      } else {
        produtosMantidos++;
        console.log(`⚪ ${produto.produto_nome} → mantido em "outros"`);
      }
    }

    console.log(`🎯 Recategorização concluída: ${produtosRecategorizados} produtos atualizados, ${produtosMantidos} mantidos`);

    return new Response(JSON.stringify({
      success: true,
      totalProdutos: produtosOutros?.length || 0,
      produtosRecategorizados,
      produtosMantidos,
      detalhes: detalhesRecategorizacao
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro na recategorização:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});