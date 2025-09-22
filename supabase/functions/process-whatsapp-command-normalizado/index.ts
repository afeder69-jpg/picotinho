// Versão melhorada da edge function com busca case-insensitive para categorias

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Utilitário para normalização de categorias case-insensitive
const categoriasNormalizadas = {
  'açougue': 'açougue',
  'bebidas': 'bebidas', 
  'congelados': 'congelados',
  'higiene/farmácia': 'higiene/farmácia',
  'higiene': 'higiene/farmácia',
  'farmacia': 'higiene/farmácia',
  'hortifruti': 'hortifruti',
  'laticínios/frios': 'laticínios/frios',
  'laticínios': 'laticínios/frios',
  'laticinios': 'laticínios/frios',
  'frios': 'laticínios/frios',
  'limpeza': 'limpeza',
  'mercearia': 'mercearia',
  'outros': 'outros',
  'padaria': 'padaria',
  'pet': 'pet',
  'carnes': 'açougue'
};

function normalizarCategoria(categoria: string): string {
  if (!categoria) return 'outros';
  
  const categoriaLower = categoria.toLowerCase().trim();
  
  // Buscar correspondência exata primeiro
  if (categoriasNormalizadas[categoriaLower as keyof typeof categoriasNormalizadas]) {
    return categoriasNormalizadas[categoriaLower as keyof typeof categoriasNormalizadas];
  }
  
  // Buscar correspondência parcial
  for (const [key, value] of Object.entries(categoriasNormalizadas)) {
    if (categoriaLower.includes(key) || key.includes(categoriaLower)) {
      return value;
    }
  }
  
  return 'outros';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { message, from } = await req.json();
    
    // Normalizar comando case-insensitive
    const comando = message.toLowerCase().trim();
    
    // Comando para consultar categoria usando normalização
    if (comando.startsWith('categoria ') || comando.startsWith('cat ')) {
      const categoriaInput = comando.replace(/^(categoria|cat)\s+/i, '').trim();
      const categoriaNormalizada = normalizarCategoria(categoriaInput);
      
      console.log(`🔍 [CATEGORIA] Input: "${categoriaInput}" -> Normalizada: "${categoriaNormalizada}"`);
      
      // Buscar produtos usando ILIKE para case-insensitive
      const { data, error } = await supabase
        .from('estoque_app')
        .select('*')
        .ilike('categoria', categoriaNormalizada)
        .gt('quantidade', 0)
        .order('produto_nome');
      
      if (error) {
        console.error('❌ Erro ao buscar produtos da categoria:', error);
        return new Response(
          JSON.stringify({ 
            reply: `❌ Erro ao consultar categoria "${categoriaInput}".`,
            error: error.message 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!data || data.length === 0) {
        return new Response(
          JSON.stringify({ 
            reply: `❌ Nenhum produto encontrado na categoria "${categoriaInput}".`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Formatar resposta
      let resposta = `📂 **${categoriaNormalizada.toUpperCase()}** (${data.length} item${data.length > 1 ? 'ns' : ''})\n\n`;
      
      let valorTotal = 0;
      
      data.forEach((produto, index) => {
        const quantidade = produto.quantidade || 0;
        const preco = produto.preco_unitario_ultimo || 0;
        const total = quantidade * preco;
        valorTotal += total;
        
        resposta += `${index + 1}. ${produto.produto_nome}\n`;
        resposta += `   📊 ${quantidade} ${produto.unidade_medida}`;
        
        if (preco > 0) {
          resposta += ` - R$ ${preco.toFixed(2)}/${produto.unidade_medida}`;
          resposta += ` (Total: R$ ${total.toFixed(2)})`;
        }
        
        resposta += '\n\n';
      });
      
      if (valorTotal > 0) {
        resposta += `💰 **Total da categoria:** R$ ${valorTotal.toFixed(2)}`;
      }
      
      return new Response(
        JSON.stringify({ reply: resposta }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Comando para listar todas as categorias
    if (comando === 'categorias' || comando === 'cats') {
      const categorias = Object.values(categoriasNormalizadas);
      const categoriasUnicas = [...new Set(categorias)].sort();
      
      let resposta = '📂 **CATEGORIAS DISPONÍVEIS:**\n\n';
      
      for (const categoria of categoriasUnicas) {
        // Contar produtos em cada categoria
        const { data } = await supabase
          .from('estoque_app')
          .select('id')
          .ilike('categoria', categoria)
          .gt('quantidade', 0);
        
        const total = data?.length || 0;
        resposta += `• ${categoria.toUpperCase()} (${total} produtos)\n`;
      }
      
      resposta += '\n💡 Use: *categoria [nome]* para ver produtos de uma categoria específica';
      
      return new Response(
        JSON.stringify({ reply: resposta }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        reply: 'Comando não reconhecido. Use "categorias" para ver todas as categorias ou "categoria [nome]" para consultar uma específica.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ 
        reply: '❌ Erro interno do sistema.',
        error: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});