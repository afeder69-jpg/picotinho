// Versão melhorada da edge function com busca case-insensitive para categorias

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Busca categoria usando a função do banco de dados
 */
async function buscarCategoriaPorTermo(supabase: any, termo: string) {
  try {
    const { data, error } = await supabase.rpc('buscar_categoria_por_termo', {
      termo_busca: termo
    });
    
    if (error) {
      console.error('Erro ao buscar categoria:', error);
      return null;
    }
    
    return data?.[0] || null;
  } catch (error) {
    console.error('Erro ao conectar com o banco:', error);
    return null;
  }
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
    
    // Comando para consultar categoria usando normalização do banco
    if (comando.startsWith('categoria ') || comando.startsWith('cat ')) {
      const categoriaInput = comando.replace(/^(categoria|cat)\s+/i, '').trim();
      
      // Buscar categoria no banco usando a função específica
      const categoriaEncontrada = await buscarCategoriaPorTermo(supabase, categoriaInput);
      
      if (!categoriaEncontrada) {
        return new Response(
          JSON.stringify({ 
            reply: `❌ Categoria "${categoriaInput}" não encontrada. Use "categorias" para ver as disponíveis.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const nomeCategoria = categoriaEncontrada.categoria_nome;
      console.log(`🔍 [CATEGORIA] Input: "${categoriaInput}" -> Encontrada: "${nomeCategoria}"`);
      
      // Buscar produtos da categoria usando ILIKE para case-insensitive  
      // NOTA: Esta função não filtra por user_id pois é uma versão simplificada
      const { data, error } = await supabase
        .from('estoque_app')
        .select('*')
        .ilike('categoria', nomeCategoria)
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
            reply: `❌ Nenhum produto encontrado na categoria "${nomeCategoria}".`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Formatar resposta
      let resposta = `📂 **${nomeCategoria.toUpperCase()}** (${data.length} item${data.length > 1 ? 'ns' : ''})\n\n`;
      
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
      // Buscar categorias diretamente do banco
      const { data: categoriasDB, error: categoriaError } = await supabase
        .from('categorias')
        .select('nome, sinonimos')
        .eq('ativa', true)
        .order('nome');
      
      if (categoriaError) {
        console.error('❌ Erro ao buscar categorias:', categoriaError);
        return new Response(
          JSON.stringify({ 
            reply: '❌ Erro ao carregar categorias do sistema.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      let resposta = '📂 **CATEGORIAS DISPONÍVEIS:**\n\n';
      
      for (const categoria of categoriasDB || []) {
        // Contar produtos em cada categoria
        const { data } = await supabase
          .from('estoque_app')
          .select('id')
          .ilike('categoria', categoria.nome)
          .gt('quantidade', 0);
        
        const total = data?.length || 0;
        const sinonimos = categoria.sinonimos ? ` (${categoria.sinonimos.slice(0, 3).join(', ')}${categoria.sinonimos.length > 3 ? '...' : ''})` : '';
        resposta += `• ${categoria.nome.toUpperCase()} (${total} produtos)${sinonimos}\n`;
      }
      
      resposta += '\n💡 Use: *categoria [nome]* para ver produtos de uma categoria específica';
      resposta += '\n💡 Aceita variações como: carnes, frios, higiene, etc.';
      
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