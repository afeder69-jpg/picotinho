import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecategorizationRule {
  keywords: string[];
  categorias_origem?: string[];
  categoria_destino: string;
  descricao: string;
  ativa: boolean;
}

interface Mudanca {
  produto_nome: string;
  categoria_anterior: string;
  categoria_nova: string;
  razao: string;
  status: 'sucesso' | 'erro';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Iniciando recategorização inteligente de produtos...');

    // Buscar regras ativas da tabela
    const { data: regras, error: regrasError } = await supabase
      .from('regras_recategorizacao')
      .select('keywords, categorias_origem, categoria_destino, descricao, ativa')
      .eq('ativa', true);

    if (regrasError) {
      throw new Error(`Erro ao buscar regras: ${regrasError.message}`);
    }

    if (!regras || regras.length === 0) {
      return new Response(JSON.stringify({
        sucesso: true,
        produtos_analisados: 0,
        produtos_recategorizados: 0,
        produtos_mantidos: 0,
        mudancas: [],
        timestamp: new Date().toISOString(),
        aviso: 'Nenhuma regra ativa encontrada'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    console.log(`📋 Total de regras ativas: ${regras.length}`);

    // Buscar todos os produtos do estoque
    const { data: produtos, error: produtosError } = await supabase
      .from('estoque_app')
      .select('id, produto_nome, categoria, user_id');

    if (produtosError) {
      throw new Error(`Erro ao buscar produtos: ${produtosError.message}`);
    }

    console.log(`📦 Total de produtos encontrados: ${produtos?.length || 0}`);

    const mudancas: Mudanca[] = [];
    let produtosRecategorizados = 0;
    let produtosAnalisados = 0;

    for (const produto of produtos || []) {
      produtosAnalisados++;
      const nomeLower = produto.produto_nome.toLowerCase();
      const categoriaAtual = produto.categoria.toUpperCase();

      // Verificar cada regra
      for (const regra of regras) {
        // Verificar se alguma keyword match
        const matchKeyword = regra.keywords.some(keyword => 
          nomeLower.includes(keyword.toLowerCase())
        );

        if (!matchKeyword) continue;

        // Verificar se precisa recategorizar
        const categoriaAlvo = regra.categoria_destino.toUpperCase();
        
        // Se já está na categoria correta, pular
        if (categoriaAtual === categoriaAlvo) {
          console.log(`✅ ${produto.produto_nome} já está em ${categoriaAlvo}`);
          continue;
        }

        // Se há restrição de categoria origem, verificar
        if (regra.categorias_origem && regra.categorias_origem.length > 0) {
          const categoriaOrigemMatch = regra.categorias_origem.some(cat => 
            categoriaAtual.includes(cat.toUpperCase()) || cat.toUpperCase().includes(categoriaAtual)
          );
          
          if (!categoriaOrigemMatch) {
            console.log(`⏭️ ${produto.produto_nome} está em ${categoriaAtual}, mas regra só aplica para ${regra.categorias_origem.join(', ')}`);
            continue;
          }
        }

        // Recategorizar
        console.log(`🔄 Recategorizando: ${produto.produto_nome}`);
        console.log(`   De: ${categoriaAtual} → Para: ${categoriaAlvo}`);

        const { error: updateError } = await supabase
          .from('estoque_app')
          .update({ 
            categoria: categoriaAlvo.toLowerCase(),
            updated_at: new Date().toISOString()
          })
          .eq('id', produto.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar ${produto.produto_nome}:`, updateError.message);
          mudancas.push({
            produto_nome: produto.produto_nome,
            categoria_anterior: categoriaAtual,
            categoria_nova: categoriaAlvo,
            razao: regra.descricao,
            status: 'erro'
          });
        } else {
          console.log(`✅ Produto recategorizado: ${produto.produto_nome}`);
          produtosRecategorizados++;
          mudancas.push({
            produto_nome: produto.produto_nome,
            categoria_anterior: categoriaAtual,
            categoria_nova: categoriaAlvo,
            razao: regra.descricao,
            status: 'sucesso'
          });
        }

        // Só aplicar a primeira regra que fizer match
        break;
      }
    }

    const resultado = {
      sucesso: true,
      produtos_analisados: produtosAnalisados,
      produtos_recategorizados: produtosRecategorizados,
      produtos_mantidos: produtosAnalisados - produtosRecategorizados,
      mudancas: mudancas,
      timestamp: new Date().toISOString()
    };

    console.log('📊 Resultado da recategorização:');
    console.log(`   Total analisado: ${resultado.produtos_analisados}`);
    console.log(`   Recategorizados: ${resultado.produtos_recategorizados}`);
    console.log(`   Mantidos: ${resultado.produtos_mantidos}`);

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('❌ Erro na recategorização:', error);
    return new Response(
      JSON.stringify({
        sucesso: false,
        erro: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
