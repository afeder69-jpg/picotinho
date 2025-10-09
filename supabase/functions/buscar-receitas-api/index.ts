import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  traduzirCategoria, 
  traduzirArea, 
  traduzirIngrediente, 
  traduzirMedida 
} from "../_shared/traducoes.ts";

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
      query, 
      mode = 'search', // search, random, lookup, categories, areas, ingredients, filter
      filterType, // ingredient, category, area (when mode = filter)
      id, // meal ID (when mode = lookup)
      api = 'themealdb', 
      maxResults = 10 
    } = await req.json();

    console.log('🔍 Buscando receitas:', { query, mode, filterType, id, api });

    let receitas: any[] = [];

    if (api === 'themealdb') {
      const baseUrl = 'https://www.themealdb.com/api/json/v1/1';
      let url = '';

      // Determinar endpoint baseado no modo
      switch (mode) {
        case 'random':
          url = `${baseUrl}/random.php`;
          break;
        case 'lookup':
          url = `${baseUrl}/lookup.php?i=${id}`;
          break;
        case 'categories':
          url = `${baseUrl}/categories.php`;
          break;
        case 'areas':
          url = `${baseUrl}/list.php?a=list`;
          break;
        case 'ingredients':
          url = `${baseUrl}/list.php?i=list`;
          break;
        case 'filter':
          if (filterType === 'ingredient') {
            url = `${baseUrl}/filter.php?i=${query}`;
          } else if (filterType === 'category') {
            url = `${baseUrl}/filter.php?c=${query}`;
          } else if (filterType === 'area') {
            url = `${baseUrl}/filter.php?a=${query}`;
          }
          break;
        case 'search':
        default:
          url = `${baseUrl}/search.php?s=${query || ''}`;
          break;
      }

      console.log('📡 URL da API:', url);
      const response = await fetch(url);
      const data = await response.json();

      // Processar resposta baseado no modo
      if (mode === 'categories') {
        receitas = (data.categories || []).map((cat: any) => ({
          id: cat.idCategory,
          titulo: traduzirCategoria(cat.strCategory),
          titulo_original: cat.strCategory,
          descricao: cat.strCategoryDescription,
          imagem_url: cat.strCategoryThumb,
          tipo: 'category'
        }));
      } else if (mode === 'areas') {
        receitas = (data.meals || []).map((area: any) => ({
          id: area.strArea,
          titulo: traduzirArea(area.strArea),
          titulo_original: area.strArea,
          tipo: 'area'
        }));
      } else if (mode === 'ingredients') {
        receitas = (data.meals || []).map((ing: any) => ({
          id: ing.idIngredient,
          titulo: traduzirIngrediente(ing.strIngredient),
          titulo_original: ing.strIngredient,
          descricao: ing.strDescription,
          imagem_url: `https://www.themealdb.com/images/ingredients/${ing.strIngredient}.png`,
          tipo: 'ingredient'
        }));
      } else if (mode === 'filter') {
        // Filtros retornam apenas informações básicas, buscar detalhes completos
        const meals = data.meals || [];
        const detalhesPromises = meals.slice(0, maxResults).map(async (meal: any) => {
          const detailsRes = await fetch(`${baseUrl}/lookup.php?i=${meal.idMeal}`);
          const detailsData = await detailsRes.json();
          const fullMeal = detailsData.meals?.[0];
          
          if (!fullMeal) return null;

          return {
            id: fullMeal.idMeal,
            titulo: fullMeal.strMeal,
            descricao: fullMeal.strInstructions,
            imagem_url: fullMeal.strMealThumb,
            categoria: traduzirCategoria(fullMeal.strCategory),
            area: traduzirArea(fullMeal.strArea),
            video_url: fullMeal.strYoutube,
            ingredientes: extrairIngredientesTraduzidos(fullMeal),
            api_source: 'themealdb'
          };
        });
        
        const detalhesCompletos = await Promise.all(detalhesPromises);
        receitas = detalhesCompletos.filter(r => r !== null);
      } else {
        // search, random, lookup
        const meals = data.meals || [];
        receitas = meals.slice(0, maxResults).map((meal: any) => ({
          id: meal.idMeal,
          titulo: meal.strMeal,
          descricao: meal.strInstructions,
          imagem_url: meal.strMealThumb,
          categoria: traduzirCategoria(meal.strCategory),
          area: traduzirArea(meal.strArea),
          video_url: meal.strYoutube,
          ingredientes: extrairIngredientesTraduzidos(meal),
          api_source: 'themealdb'
        }));
      }

    } else if (api === 'edamam') {
      const APP_ID = Deno.env.get('EDAMAM_APP_ID');
      const APP_KEY = Deno.env.get('EDAMAM_APP_KEY');
      
      if (!APP_ID || !APP_KEY) {
        throw new Error('Credenciais Edamam não configuradas');
      }

      const url = `https://api.edamam.com/search?q=${query}&app_id=${APP_ID}&app_key=${APP_KEY}&to=${maxResults}`;
      const response = await fetch(url);
      const data = await response.json();

      receitas = (data.hits || []).map((hit: any) => ({
        id: hit.recipe.uri,
        titulo: hit.recipe.label,
        descricao: hit.recipe.url,
        imagem_url: hit.recipe.image,
        categoria: hit.recipe.dishType?.[0],
        area: hit.recipe.cuisineType?.[0],
        ingredientes: hit.recipe.ingredients.map((ing: any) => ({
          nome: ing.food,
          quantidade: ing.quantity?.toString() || '1',
          unidade: ing.measure || 'un',
          imagem_url: ing.image
        })),
        api_source: 'edamam'
      }));
    }

    console.log(`✅ ${receitas.length} receitas encontradas`);

    return new Response(
      JSON.stringify({ receitas, total: receitas.length }),
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

// Função auxiliar para extrair ingredientes traduzidos do TheMealDB
function extrairIngredientesTraduzidos(meal: any): any[] {
  const ingredientes = [];
  for (let i = 1; i <= 20; i++) {
    const ingrediente = meal[`strIngredient${i}`];
    const medida = meal[`strMeasure${i}`];
    
    if (ingrediente && ingrediente.trim()) {
      const ingredienteOriginal = ingrediente.trim();
      const medidaOriginal = medida?.trim() || '';
      
      ingredientes.push({
        nome: traduzirIngrediente(ingredienteOriginal),
        nome_original: ingredienteOriginal,
        quantidade: traduzirMedida(medidaOriginal) || '1',
        quantidade_original: medidaOriginal || '1',
        unidade: 'un',
        imagem_url: `https://www.themealdb.com/images/ingredients/${ingredienteOriginal}.png`
      });
    }
  }
  return ingredientes;
}
