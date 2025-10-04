import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OpenFoodProduct {
  code: string;
  product_name: string;
  brands: string;
  categories: string;
  quantity: string;
  image_url?: string;
  image_small_url?: string;
}

interface ImportacaoParams {
  limite: number;
  pagina: number;
  comImagem: boolean;
}

// Mapear categorias Open Food Facts → Picotinho (11 categorias)
function mapearCategoriaOpenFood(categoriesOpenFood: string): string {
  const categoriasBaixas = categoriesOpenFood.toLowerCase();
  
  // AÇOUGUE
  if (categoriasBaixas.includes('meat') || 
      categoriasBaixas.includes('poultry') ||
      categoriasBaixas.includes('fish') ||
      categoriasBaixas.includes('seafood')) {
    return 'AÇOUGUE';
  }
  
  // BEBIDAS
  if (categoriasBaixas.includes('beverages') ||
      categoriasBaixas.includes('drinks') ||
      categoriasBaixas.includes('juices') ||
      categoriasBaixas.includes('water') ||
      categoriasBaixas.includes('sodas')) {
    return 'BEBIDAS';
  }
  
  // HORTIFRUTI
  if (categoriasBaixas.includes('fruits') ||
      categoriasBaixas.includes('vegetables') ||
      categoriasBaixas.includes('produce')) {
    return 'HORTIFRUTI';
  }
  
  // LATICÍNIOS/FRIOS
  if (categoriasBaixas.includes('dairy') ||
      categoriasBaixas.includes('cheese') ||
      categoriasBaixas.includes('yogurt') ||
      categoriasBaixas.includes('milk')) {
    return 'LATICÍNIOS/FRIOS';
  }
  
  // PADARIA
  if (categoriasBaixas.includes('bread') ||
      categoriasBaixas.includes('bakery') ||
      categoriasBaixas.includes('pastries')) {
    return 'PADARIA';
  }
  
  // CONGELADOS
  if (categoriasBaixas.includes('frozen')) {
    return 'CONGELADOS';
  }
  
  // LIMPEZA
  if (categoriasBaixas.includes('cleaning') ||
      categoriasBaixas.includes('detergent')) {
    return 'LIMPEZA';
  }
  
  // HIGIENE/FARMÁCIA
  if (categoriasBaixas.includes('hygiene') ||
      categoriasBaixas.includes('cosmetics') ||
      categoriasBaixas.includes('personal-care') ||
      categoriasBaixas.includes('beauty')) {
    return 'HIGIENE/FARMÁCIA';
  }
  
  // MERCEARIA (padrão para alimentos não categorizados)
  if (categoriasBaixas.includes('food') ||
      categoriasBaixas.includes('groceries') ||
      categoriasBaixas.includes('snacks') ||
      categoriasBaixas.includes('sweets')) {
    return 'MERCEARIA';
  }
  
  // PET
  if (categoriasBaixas.includes('pet')) {
    return 'PET';
  }
  
  return 'OUTROS';
}

// Processar imagem: download e upload
async function processarImagem(
  imageUrl: string,
  codigo_barras: string,
  supabase: any
): Promise<{ url: string; path: string } | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Erro ao baixar imagem: ${response.statusText}`);
      return null;
    }
    
    const blob = await response.blob();
    const extensao = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
    const nomeArquivo = `${codigo_barras}.${extensao}`;
    const path = `produtos-master/${nomeArquivo}`;
    
    const { error: uploadError } = await supabase.storage
      .from('produtos-master-fotos')
      .upload(path, blob, {
        contentType: blob.type,
        upsert: true
      });
      
    if (uploadError) {
      console.error(`Erro ao fazer upload: ${uploadError.message}`);
      return null;
    }
    
    const { data: urlData } = supabase.storage
      .from('produtos-master-fotos')
      .getPublicUrl(path);
      
    return {
      url: urlData.publicUrl,
      path: path
    };
  } catch (error) {
    console.error('Erro ao processar imagem:', error);
    return null;
  }
}

// Buscar produtos na API Open Food Facts (API v2)
async function buscarProdutosOpenFood(params: ImportacaoParams): Promise<OpenFoodProduct[]> {
  const baseUrl = 'https://world.openfoodfacts.org/api/v2/search';
  
  const queryParams = new URLSearchParams({
    countries_tags_en: 'brazil',
    fields: 'code,product_name,brands,categories_tags,quantity,image_url',
    page_size: params.limite.toString(),
    page: params.pagina.toString()
  });
  
  console.log(`🌍 Chamando API v2: ${baseUrl}?${queryParams}`);
  
  const response = await fetch(`${baseUrl}?${queryParams}`);
  
  if (!response.ok) {
    console.error(`❌ Erro na API: ${response.status} ${response.statusText}`);
    throw new Error(`API retornou ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  console.log(`📊 API retornou: ${data.count} produtos totais, ${data.products?.length || 0} nesta página`);
  
  let produtos = data.products || [];
  
  // Filtrar produtos sem imagem se necessário
  if (params.comImagem) {
    produtos = produtos.filter((p: OpenFoodProduct) => p.image_url);
    console.log(`🖼️ Após filtro de imagem: ${produtos.length} produtos`);
  }
  
  return produtos;
}

// Inserir produto no staging
async function inserirProdutoStaging(
  supabase: any,
  produto: OpenFoodProduct
): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    if (!produto.product_name || !produto.brands) {
      return {
        sucesso: false,
        mensagem: `Produto sem nome ou marca: ${produto.code}`
      };
    }

    const categoria = mapearCategoriaOpenFood(produto.categories || '');
    const nomeBase = produto.product_name.trim();
    const marca = produto.brands.split(',')[0].trim();
    const quantidade = produto.quantity || 'UN';
    
    // Extrair quantidade e unidade
    const qtdMatch = quantidade.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
    const qtdValor = qtdMatch ? parseFloat(qtdMatch[1]) : null;
    const qtdUnidade = qtdMatch ? qtdMatch[2].toUpperCase() : quantidade;
    
    const textoOriginal = `${nomeBase} ${marca} ${qtdUnidade}`.trim();
    
    // Processar imagem se disponível
    let imagemUrl: string | null = null;
    let imagemPath: string | null = null;
    
    if (produto.image_url) {
      const imagem = await processarImagem(
        produto.image_url,
        produto.code,
        supabase
      );
      
      if (imagem) {
        imagemUrl = imagem.url;
        imagemPath = imagem.path;
      }
    }
    
    // Inserir no staging (upsert para evitar duplicatas)
    const { error } = await supabase
      .from('open_food_facts_staging')
      .upsert({
        codigo_barras: produto.code,
        texto_original: textoOriginal,
        dados_brutos: {
          nome_base: nomeBase,
          marca: marca,
          categoria: categoria,
          qtd_valor: qtdValor,
          qtd_unidade: qtdUnidade,
          product_name: produto.product_name,
          brands: produto.brands,
          quantity: produto.quantity
        },
        processada: false,
        imagem_url: imagemUrl,
        imagem_path: imagemPath
      }, {
        onConflict: 'codigo_barras',
        ignoreDuplicates: true
      });
      
    if (error) {
      // Se for erro de duplicata, é esperado
      if (error.code === '23505' || error.message?.includes('duplicate')) {
        return {
          sucesso: true,
          mensagem: `Produto já existente (ignorado): ${textoOriginal}`
        };
      }
      
      return {
        sucesso: false,
        mensagem: `Erro ao inserir: ${error.message}`
      };
    }
    
    return {
      sucesso: true,
      mensagem: `Produto importado: ${textoOriginal}`
    };
  } catch (error) {
    return {
      sucesso: false,
      mensagem: `Erro: ${error.message}`
    };
  }
}

serve(async (req) => {
  console.log('🚀 Edge Function importar-open-food-facts iniciada');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { limite = 50, pagina = 1, comImagem = true } = await req.json();

    console.log(`🔍 Buscando produtos brasileiros do Open Food Facts (página ${pagina}, limite ${limite})`);

    const produtos = await buscarProdutosOpenFood({
      limite,
      pagina,
      comImagem
    });

    console.log(`📦 ${produtos.length} produtos encontrados`);

    const resultados = {
      total: produtos.length,
      importados: 0,
      duplicados: 0,
      erros: 0,
      comImagem: 0,
      semImagem: 0,
      logs: [] as string[]
    };

    for (const produto of produtos) {
      if (produto.image_url) {
        resultados.comImagem++;
      } else {
        resultados.semImagem++;
      }

      const resultado = await inserirProdutoStaging(supabaseClient, produto);
      
      if (resultado.sucesso) {
        if (resultado.mensagem.includes('já existente')) {
          resultados.duplicados++;
          resultados.logs.push(`⏭️  ${resultado.mensagem}`);
        } else {
          resultados.importados++;
          resultados.logs.push(`✅ ${resultado.mensagem}`);
        }
      } else {
        resultados.erros++;
        resultados.logs.push(`❌ ${resultado.mensagem}`);
      }

      // Rate limiting: 1 requisição por segundo
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`✅ Importação concluída: ${resultados.importados} importados, ${resultados.duplicados} duplicados, ${resultados.erros} erros`);

    return new Response(
      JSON.stringify(resultados),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na importação:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
