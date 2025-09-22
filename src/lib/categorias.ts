// Utilitário para normalização de categorias
// Permite busca case-insensitive

export const categoriasNormalizadas = {
  'açougue': 'AÇOUGUE',
  'bebidas': 'BEBIDAS', 
  'congelados': 'CONGELADOS',
  'higiene/farmácia': 'HIGIENE/FARMÁCIA',
  'hortifruti': 'HORTIFRUTI',
  'laticínios/frios': 'LATICÍNIOS/FRIOS',
  'laticínios': 'LATICÍNIOS/FRIOS', // Alias
  'limpeza': 'LIMPEZA',
  'mercearia': 'MERCEARIA', 
  'outros': 'OUTROS',
  'padaria': 'PADARIA',
  'pet': 'PET',
  'carnes': 'AÇOUGUE' // Alias para açougue
};

export const ordemCategorias = [
  'hortifruti', 'bebidas', 'mercearia', 'açougue', 'carnes', 'padaria', 
  'laticínios/frios', 'laticínios', 'limpeza', 'higiene/farmácia', 'congelados', 'pet', 'outros'
];

/**
 * Normaliza uma categoria para comparação case-insensitive
 */
export function normalizarCategoria(categoria: string | null | undefined): string {
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
  
  return 'OUTROS';
}

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