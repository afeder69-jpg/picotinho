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

interface ProdutoNormalizado {
  sku_global: string;
  nome_padrao: string;
  nome_base: string;
  marca: string;
  categoria: string;
  tipo_embalagem: string | null;
  qtd_valor: number | null;
  qtd_unidade: string | null;
  granel: boolean;
  imagem_url?: string;
  imagem_path?: string;
  codigo_barras?: string;
}

interface ImportacaoParams {
  categorias?: string[];
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

// Gerar SKU no padrão Picotinho: CATEGORIA-NOME_BASE-MARCA-QUANTIDADE
function gerarSkuPicotinho(
  categoria: string,
  nomeBase: string,
  marca: string,
  quantidade: string
): string {
  const catNorm = categoria.toUpperCase().replace(/[^A-Z]/g, '_');
  const nomeNorm = nomeBase.toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const marcaNorm = marca.toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const qtdNorm = quantidade.toUpperCase().replace(/\s/g, '');
  
  return `${catNorm}-${nomeNorm}-${marcaNorm}-${qtdNorm}`;
}

// Verificação tripla de duplicados
async function verificarDuplicado(
  supabase: any,
  skuGlobal: string,
  nomeBase: string,
  marca: string,
  quantidade: string,
  codigoBarras?: string
): Promise<boolean> {
  // 1. Verificar por SKU exato
  const { data: porSku } = await supabase
    .from('produtos_master_global')
    .select('id')
    .eq('sku_global', skuGlobal)
    .maybeSingle();
    
  if (porSku) return true;
  
  // 2. Verificar por nome_base + marca + quantidade (normalizado)
  const { data: porDados } = await supabase
    .from('produtos_master_global')
    .select('id')
    .ilike('nome_base', nomeBase)
    .ilike('marca', marca)
    .ilike('qtd_unidade', quantidade)
    .maybeSingle();
    
  if (porDados) return true;
  
  // 3. Verificar por código de barras se disponível
  if (codigoBarras) {
    const { data: porBarras } = await supabase
      .from('produtos_master_global')
      .select('id')
      .eq('codigo_barras', codigoBarras)
      .maybeSingle();
      
    if (porBarras) return true;
  }
  
  return false;
}

// Processar imagem: download e upload
async function processarImagem(
  imageUrl: string,
  skuGlobal: string,
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
    const nomeArquivo = `${skuGlobal}.${extensao}`;
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

// Normalizar produto do Open Food Facts
function normalizarProduto(produto: OpenFoodProduct): ProdutoNormalizado | null {
  if (!produto.product_name || !produto.brands) {
    return null;
  }
  
  const categoria = mapearCategoriaOpenFood(produto.categories || '');
  const nomeBase = produto.product_name.trim();
  const marca = produto.brands.split(',')[0].trim();
  const quantidade = produto.quantity || 'UN';
  
  // Extrair quantidade e unidade
  const qtdMatch = quantidade.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
  const qtdValor = qtdMatch ? parseFloat(qtdMatch[1]) : null;
  const qtdUnidade = qtdMatch ? qtdMatch[2].toUpperCase() : quantidade;
  
  const skuGlobal = gerarSkuPicotinho(categoria, nomeBase, marca, qtdUnidade);
  const nomePadrao = `${nomeBase} ${marca} ${qtdUnidade}`.toUpperCase();
  
  return {
    sku_global: skuGlobal,
    nome_padrao: nomePadrao,
    nome_base: nomeBase.toUpperCase(),
    marca: marca.toUpperCase(),
    categoria,
    tipo_embalagem: null,
    qtd_valor: qtdValor,
    qtd_unidade: qtdUnidade,
    granel: false,
    imagem_url: produto.image_url || produto.image_small_url,
    codigo_barras: produto.code
  };
}

// Buscar produtos na API Open Food Facts
async function buscarProdutosOpenFood(params: ImportacaoParams): Promise<OpenFoodProduct[]> {
  const baseUrl = 'https://world.openfoodfacts.org/cgi/search.pl';
  
  const queryParams = new URLSearchParams({
    countries_tags: 'en:brazil',
    fields: 'code,product_name,brands,categories,quantity,image_url,image_small_url',
    page_size: params.limite.toString(),
    page: params.pagina.toString(),
    json: '1'
  });
  
  if (params.comImagem) {
    queryParams.append('states_tags', 'en:photos-validated');
  }
  
  if (params.categorias && params.categorias.length > 0) {
    queryParams.append('categories_tags', params.categorias.join(','));
  }
  
  const response = await fetch(`${baseUrl}?${queryParams}`);
  const data = await response.json();
  
  return data.products || [];
}

// Inserir produto no banco
async function inserirProduto(
  supabase: any,
  produto: ProdutoNormalizado
): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    // Verificação de duplicado
    const isDuplicado = await verificarDuplicado(
      supabase,
      produto.sku_global,
      produto.nome_base,
      produto.marca,
      produto.qtd_unidade || '',
      produto.codigo_barras
    );
    
    if (isDuplicado) {
      return {
        sucesso: false,
        mensagem: `Produto já existe: ${produto.nome_padrao}`
      };
    }
    
    // Processar imagem se disponível
    let imagemUrl: string | null = null;
    let imagemPath: string | null = null;
    
    if (produto.imagem_url) {
      const imagem = await processarImagem(
        produto.imagem_url,
        produto.sku_global,
        supabase
      );
      
      if (imagem) {
        imagemUrl = imagem.url;
        imagemPath = imagem.path;
      }
    }
    
    // Inserir no banco
    const { error } = await supabase
      .from('produtos_master_global')
      .insert({
        sku_global: produto.sku_global,
        nome_padrao: produto.nome_padrao,
        nome_base: produto.nome_base,
        marca: produto.marca,
        categoria: produto.categoria,
        tipo_embalagem: produto.tipo_embalagem,
        qtd_valor: produto.qtd_valor,
        qtd_unidade: produto.qtd_unidade,
        granel: produto.granel,
        imagem_url: imagemUrl,
        imagem_path: imagemPath,
        status: 'ativo',
        confianca_normalizacao: 85,
        codigo_barras: produto.codigo_barras,
        aprovado_em: new Date().toISOString(),
        aprovado_por: null
      });
      
    if (error) {
      return {
        sucesso: false,
        mensagem: `Erro ao inserir: ${error.message}`
      };
    }
    
    return {
      sucesso: true,
      mensagem: `Produto importado: ${produto.nome_padrao}`
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

    const { categorias, limite = 50, pagina = 1, comImagem = true } = await req.json();

    console.log(`🔍 Buscando produtos do Open Food Facts (página ${pagina}, limite ${limite})`);

    const produtos = await buscarProdutosOpenFood({
      categorias,
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
      const produtoNormalizado = normalizarProduto(produto);
      
      if (!produtoNormalizado) {
        resultados.erros++;
        resultados.logs.push(`❌ Produto inválido: ${produto.product_name}`);
        continue;
      }

      if (produtoNormalizado.imagem_url) {
        resultados.comImagem++;
      } else {
        resultados.semImagem++;
      }

      const resultado = await inserirProduto(supabaseClient, produtoNormalizado);
      
      if (resultado.sucesso) {
        resultados.importados++;
        resultados.logs.push(`✅ ${resultado.mensagem}`);
      } else if (resultado.mensagem.includes('já existe')) {
        resultados.duplicados++;
        resultados.logs.push(`⚠️ ${resultado.mensagem}`);
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
