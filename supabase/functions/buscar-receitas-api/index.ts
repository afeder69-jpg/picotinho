import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      query = '', 
      mode = 'search', // search, random, categories
      maxResults = 10 
    } = await req.json();

    console.log('🔍 Buscando receitas brasileiras:', { query, mode, maxResults });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let receitas: any[] = [];

    if (mode === 'random') {
      // Buscar receita aleatória
      const { data, error } = await supabase
        .from('receitas_publicas_brasileiras')
        .select('*')
        .limit(20); // Pegar 20 para ter variedade

      if (error) throw error;

      // Selecionar uma aleatória
      if (data && data.length > 0) {
        const randomIndex = Math.floor(Math.random() * data.length);
        receitas = [data[randomIndex]];
      }

    } else if (mode === 'categories') {
      // Buscar categorias únicas
      const { data, error } = await supabase
        .from('receitas_publicas_brasileiras')
        .select('categoria')
        .not('categoria', 'is', null);

      if (error) throw error;

      // Agrupar categorias únicas
      const categoriasUnicas = [...new Set(data.map(r => r.categoria))];
      receitas = categoriasUnicas.map(cat => ({
        id: cat,
        titulo: cat,
        titulo_original: cat,
        tipo: 'category'
      }));

    } else {
      // Busca normal por título, categoria ou tags
      let queryBuilder = supabase
        .from('receitas_publicas_brasileiras')
        .select('*');

      if (query && query.trim()) {
        queryBuilder = queryBuilder.or(
          `titulo.ilike.%${query}%,categoria.ilike.%${query}%,tags.cs.{${query}}`
        );
      }

      queryBuilder = queryBuilder.limit(maxResults);

      const { data, error } = await queryBuilder;

      if (error) throw error;
      receitas = data || [];
    }

    // Formatar receitas para o formato esperado pelo frontend
    const receitasFormatadas = receitas.map((receita: any) => ({
      id: receita.id,
      titulo: receita.titulo,
      descricao: receita.modo_preparo,
      modo_preparo: receita.modo_preparo,
      imagem_url: receita.imagem_url,
      categoria: receita.categoria,
      tempo_preparo: receita.tempo_preparo,
      porcoes: receita.rendimento,
      ingredientes: Array.isArray(receita.ingredientes) 
        ? receita.ingredientes.map((ing: any) => {
            // Se o ingrediente já é um objeto com nome/quantidade, usar direto
            if (typeof ing === 'object' && ing.nome) {
              return {
                nome: ing.nome || ing.name,
                quantidade: ing.quantidade || ing.quantity || '1',
                unidade: ing.unidade || ing.unit || 'un'
              };
            }
            // Se é string, retornar como nome apenas
            return {
              nome: ing,
              quantidade: '1',
              unidade: 'un'
            };
          })
        : [],
      tags: receita.tags || [],
      fonte: 'receitas-json',
      tipo: receita.tipo // Para categorias
    }));

    console.log(`✅ ${receitasFormatadas.length} receitas encontradas`);

    return new Response(
      JSON.stringify({ receitas: receitasFormatadas, total: receitasFormatadas.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('❌ Erro ao buscar receitas:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
