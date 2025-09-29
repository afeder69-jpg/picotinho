// Utilitário para normalização de categorias usando dados do banco
import { supabase } from "@/integrations/supabase/client";

let categoriasCache: Array<{
  id: string;
  nome: string;
  sinonimos: string[];
}> | null = null;

/**
 * Limpa o cache das categorias para forçar reload
 */
export function limparCacheCategories() {
  categoriasCache = null;
  console.log('🧹 Cache de categorias limpo');
}

/**
 * Carrega as categorias do banco de dados com cache
 */
export async function carregarCategorias() {
  if (categoriasCache) {
    console.log('📋 Usando cache de categorias:', categoriasCache.length, 'categorias');
    return categoriasCache;
  }
  
  console.log('🔄 Carregando categorias do banco...');
  
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('id, nome, sinonimos')
      .eq('ativa', true);
    
    if (error) {
      console.error('❌ Erro ao carregar categorias:', error);
      return [];
    }
    
    console.log('✅ Categorias carregadas do banco:', data?.length || 0, 'categorias encontradas');
    categoriasCache = data || [];
    return categoriasCache;
  } catch (error) {
    console.error('❌ Erro ao conectar com o banco:', error);
    return [];
  }
}

/**
 * Normaliza uma categoria usando dados do banco de dados (versão assíncrona)
 */
export async function normalizarCategoriaAsync(categoria: string | null | undefined): Promise<string> {
  if (!categoria) return 'OUTROS';
  
  const categorias = await carregarCategorias();
  const categoriaLower = categoria.toLowerCase().trim();
  
  // Buscar correspondência exata no nome oficial
  for (const cat of categorias) {
    if (cat.nome.toLowerCase() === categoriaLower) {
      return cat.nome.toUpperCase();
    }
  }
  
  // Buscar correspondência nos sinônimos
  for (const cat of categorias) {
    if (cat.sinonimos) {
      for (const sinonimo of cat.sinonimos) {
        if (sinonimo.toLowerCase() === categoriaLower) {
          return cat.nome.toUpperCase();
        }
      }
    }
  }
  
  // Buscar correspondência parcial no nome
  for (const cat of categorias) {
    if (cat.nome.toLowerCase().includes(categoriaLower) || 
        categoriaLower.includes(cat.nome.toLowerCase())) {
      return cat.nome.toUpperCase();
    }
  }
  
  // Buscar correspondência parcial nos sinônimos
  for (const cat of categorias) {
    if (cat.sinonimos) {
      for (const sinonimo of cat.sinonimos) {
        if (sinonimo.toLowerCase().includes(categoriaLower) || 
            categoriaLower.includes(sinonimo.toLowerCase())) {
          return cat.nome.toUpperCase();
        }
      }
    }
  }
  
  return 'OUTROS';
}

/**
 * Busca categoria usando a função do banco de dados
 */
export async function buscarCategoriaPorTermo(termo: string) {
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

/**
 * Versão síncrona para compatibilidade (mapeamento de fallback expandido)
 */
export function normalizarCategoria(categoria: string | null | undefined): string {
  if (!categoria) return 'OUTROS';
  
  // Mapeamento expandido com sinônimos para casos síncronos
  const fallbackMap: Record<string, string> = {
    // AÇOUGUE
    'açougue': 'AÇOUGUE',
    'acougue': 'AÇOUGUE', 
    'asogue': 'AÇOUGUE',
    'asog': 'AÇOUGUE',
    'açogue': 'AÇOUGUE',
    'açog': 'AÇOUGUE',
    'carnes': 'AÇOUGUE',
    'carne': 'AÇOUGUE',
    'frango': 'AÇOUGUE',
    'frangos': 'AÇOUGUE',
    'peixe': 'AÇOUGUE',
    'peixes': 'AÇOUGUE',
    'suínos': 'AÇOUGUE',
    'suino': 'AÇOUGUE',
    'bovino': 'AÇOUGUE',
    
    // BEBIDAS
    'bebidas': 'BEBIDAS',
    'bebida': 'BEBIDAS',
    'suco': 'BEBIDAS',
    'sucos': 'BEBIDAS',
    'refrigerante': 'BEBIDAS',
    'refrigerantes': 'BEBIDAS',
    'cerveja': 'BEBIDAS',
    'cervejas': 'BEBIDAS',
    'vinho': 'BEBIDAS',
    'vinhos': 'BEBIDAS',
    'água': 'BEBIDAS',
    'agua': 'BEBIDAS',
    
    // HORTIFRUTI
    'hortifruti': 'HORTIFRUTI',
    'hortfruti': 'HORTIFRUTI',
    'hortifrute': 'HORTIFRUTI',
    'horte fruti': 'HORTIFRUTI',
    'horte frute': 'HORTIFRUTI',
    'frutas': 'HORTIFRUTI',
    'verduras': 'HORTIFRUTI',
    'legumes': 'HORTIFRUTI',
    'hortaliças': 'HORTIFRUTI',
    
    // LATICÍNIOS/FRIOS
    'laticinios': 'LATICÍNIOS/FRIOS',
    'laticínios': 'LATICÍNIOS/FRIOS',
    'frios': 'LATICÍNIOS/FRIOS',
    'queijo': 'LATICÍNIOS/FRIOS',
    'queijos': 'LATICÍNIOS/FRIOS',
    'leite': 'LATICÍNIOS/FRIOS',
    'iogurte': 'LATICÍNIOS/FRIOS',
    'manteiga': 'LATICÍNIOS/FRIOS',
    'requeijão': 'LATICÍNIOS/FRIOS',
    'embutidos': 'LATICÍNIOS/FRIOS',
    
    // HIGIENE/FARMÁCIA
    'higiene': 'HIGIENE/FARMÁCIA',
    'farmácia': 'HIGIENE/FARMÁCIA',
    'farmacia': 'HIGIENE/FARMÁCIA',
    'remedios': 'HIGIENE/FARMÁCIA',
    'remédios': 'HIGIENE/FARMÁCIA',
    'cuidados pessoais': 'HIGIENE/FARMÁCIA',
    'sabonete': 'HIGIENE/FARMÁCIA',
    'shampoo': 'HIGIENE/FARMÁCIA',
    'creme dental': 'HIGIENE/FARMÁCIA',
    
    // MERCEARIA
    'mercearia': 'MERCEARIA',
    'arroz': 'MERCEARIA',
    'feijao': 'MERCEARIA',
    'feijão': 'MERCEARIA',
    'macarrão': 'MERCEARIA',
    'massa': 'MERCEARIA',
    'massas': 'MERCEARIA',
    'oleo': 'MERCEARIA',
    'óleo': 'MERCEARIA',
    'sal': 'MERCEARIA',
    'açúcar': 'MERCEARIA',
    'café': 'MERCEARIA',
    'farinha': 'MERCEARIA',
    'enlatado': 'MERCEARIA',
    'enlatados': 'MERCEARIA',
    
    // PADARIA
    'padaria': 'PADARIA',
    'pão': 'PADARIA',
    'pao': 'PADARIA',
    'pães': 'PADARIA',
    'bolos': 'PADARIA',
    'biscoito': 'PADARIA',
    'biscoitos': 'PADARIA',
    'salgados': 'PADARIA',
    'torta': 'PADARIA',
    
    // CONGELADOS
    'congelados': 'CONGELADOS',
    'congelado': 'CONGELADOS',
    'sorvete': 'CONGELADOS',
    'pizza congelada': 'CONGELADOS',
    'nuggets': 'CONGELADOS',
    'hambúrguer': 'CONGELADOS',
    'hambúrgueres': 'CONGELADOS',
    'peixe congelado': 'CONGELADOS',
    
    // LIMPEZA
    'limpeza': 'LIMPEZA',
    'limpar': 'LIMPEZA',
    'detergente': 'LIMPEZA',
    'sabão': 'LIMPEZA',
    'sabao': 'LIMPEZA',
    'desinfetante': 'LIMPEZA',
    'amaciante': 'LIMPEZA',
    'água sanitária': 'LIMPEZA',
    'cloro': 'LIMPEZA',
    
    // PET
    'pet': 'PET',
    'animais': 'PET',
    'ração': 'PET',
    'racao': 'PET',
    'cachorro': 'PET',
    'cães': 'PET',
    'gatos': 'PET',
    'gato': 'PET',
    'coleira': 'PET',
    'petiscos': 'PET',
    
    // OUTROS
    'outros': 'OUTROS',
    'outro': 'OUTROS',
    'diversos': 'OUTROS',
    'variados': 'OUTROS',
    'miscelânea': 'OUTROS'
  };
  
  const categoriaLower = categoria.toLowerCase().trim();
  
  // Busca exata primeiro
  if (fallbackMap[categoriaLower]) {
    return fallbackMap[categoriaLower];
  }
  
  // Busca parcial
  for (const [key, value] of Object.entries(fallbackMap)) {
    if (categoriaLower.includes(key) || key.includes(categoriaLower)) {
      return value;
    }
  }
  
  return categoria.toUpperCase();
}

// Para compatibilidade com código existente
export const categoriasNormalizadas = {
  'açougue': 'AÇOUGUE',
  'bebidas': 'BEBIDAS', 
  'congelados': 'CONGELADOS',
  'higiene/farmácia': 'HIGIENE/FARMÁCIA',
  'hortifruti': 'HORTIFRUTI',
  'laticínios/frios': 'LATICÍNIOS/FRIOS',
  'laticínios': 'LATICÍNIOS/FRIOS',
  'limpeza': 'LIMPEZA',
  'mercearia': 'MERCEARIA', 
  'outros': 'OUTROS',
  'padaria': 'PADARIA',
  'pet': 'PET',
  'carnes': 'AÇOUGUE'
};

// Ordem das categorias para exibição
export const ordemCategorias = [
  'hortifruti', 'bebidas', 'mercearia', 'açougue', 'carnes', 'padaria', 
  'laticínios/frios', 'laticínios', 'limpeza', 'higiene/farmácia', 'congelados', 'pet', 'outros'
];

/**
 * Verifica se duas categorias são equivalentes (case-insensitive)
 */
export function categoriasEquivalentes(categoria1: string | null | undefined, categoria2: string | null | undefined): boolean {
  return normalizarCategoria(categoria1) === normalizarCategoria(categoria2);
}

/**
 * Obtém o nome de exibição da categoria
 */
export function obterNomeExibicaoCategoria(categoria: string | null | undefined): string {
  return normalizarCategoria(categoria);
}

/**
 * Filtra itens por categoria (case-insensitive)
 */
export function filtrarPorCategoria<T extends { categoria?: string | null }>(
  items: T[], 
  categoriaFiltro: string
): T[] {
  const categoriaFiltroNormalizada = normalizarCategoria(categoriaFiltro);
  
  return items.filter(item => {
    const categoriaNormalizada = normalizarCategoria(item.categoria);
    return categoriaNormalizada === categoriaFiltroNormalizada;
  });
}