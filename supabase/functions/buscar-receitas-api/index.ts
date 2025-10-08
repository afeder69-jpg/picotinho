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
    const { query, api = 'themealdb', maxResults = 10 } = await req.json();
    
    if (!query) {
      throw new Error('Parâmetro "query" é obrigatório');
    }

    console.log(`🔍 Buscando receitas em ${api} para: ${query}`);

    let receitas: any[] = [];

    if (api === 'themealdb') {
      // TheMealDB - API gratuita
      const response = await fetch(
        `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`
      );
      const data = await response.json();

      if (data.meals) {
        receitas = data.meals.slice(0, maxResults).map((meal: any) => ({
          api_source_id: meal.idMeal,
          api_source_name: 'themealdb',
          titulo: meal.strMeal,
          descricao: meal.strCategory,
          categoria: meal.strCategory,
          instrucoes: meal.strInstructions,
          imagem_url: meal.strMealThumb,
          tags: meal.strTags?.split(',') || [],
          ingredientes: extrairIngredientes(meal),
        }));
      }
    } else if (api === 'edamam') {
      // Edamam - Requer API key
      const edamamAppId = Deno.env.get('EDAMAM_APP_ID');
      const edamamAppKey = Deno.env.get('EDAMAM_APP_KEY');
      
      if (!edamamAppId || !edamamAppKey) {
        throw new Error('Credenciais Edamam não configuradas');
      }

      const response = await fetch(
        `https://api.edamam.com/api/recipes/v2?type=public&q=${encodeURIComponent(query)}&app_id=${edamamAppId}&app_key=${edamamAppKey}&to=${maxResults}`
      );
      const data = await response.json();

      if (data.hits) {
        receitas = data.hits.map((hit: any) => {
          const recipe = hit.recipe;
          return {
            api_source_id: recipe.uri.split('#recipe_')[1],
            api_source_name: 'edamam',
            titulo: recipe.label,
            descricao: recipe.cuisineType?.join(', '),
            categoria: recipe.dishType?.[0],
            instrucoes: recipe.url,
            imagem_url: recipe.image,
            tempo_preparo: recipe.totalTime,
            porcoes: recipe.yield,
            tags: [...(recipe.cuisineType || []), ...(recipe.dishType || [])],
            ingredientes: recipe.ingredients.map((ing: any) => ({
              ingrediente: ing.food,
              quantidade: ing.quantity,
              unidade_medida: ing.measure,
              texto_original: ing.text,
            })),
          };
        });
      }
    }

    console.log(`✅ Encontradas ${receitas.length} receitas`);

    return new Response(
      JSON.stringify({ receitas, total: receitas.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao buscar receitas:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extrairIngredientes(meal: any): any[] {
  const ingredientes: any[] = [];
  
  for (let i = 1; i <= 20; i++) {
    const ingrediente = meal[`strIngredient${i}`];
    const medida = meal[`strMeasure${i}`];
    
    if (ingrediente && ingrediente.trim()) {
      ingredientes.push({
        ingrediente: ingrediente.trim(),
        quantidade: medida?.trim() || '',
        unidade_medida: 'un',
        texto_original: `${medida || ''} ${ingrediente}`.trim(),
      });
    }
  }
  
  return ingredientes;
}
