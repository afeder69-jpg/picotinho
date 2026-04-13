import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza texto para busca: insensível a acentos, maiúsculas/minúsculas e espaços extras.
 * Usar em TODAS as buscas visíveis ao usuário no sistema.
 * @param texto Texto a normalizar
 * @returns String normalizada para comparação
 */
export function normalizarParaBusca(texto: string): string {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formata distância de forma padronizada em toda a aplicação
 * @param distancia Distância em quilômetros
 * @returns String formatada (ex: "700m" ou "3.4km")
 */
export function formatarDistancia(distancia: number | string): string {
  // Garantir que distancia seja um número
  const dist = typeof distancia === 'string' ? parseFloat(distancia) : distancia;
  
  // Validar se é um número válido
  if (isNaN(dist) || dist < 0) {
    return '0m';
  }
  
  // Padronizar exibição: <1km em metros, ≥1km em quilômetros
  if (dist < 1) {
    return `${Math.round(dist * 1000)}m`;
  } else {
    return `${dist.toFixed(1)}km`;
  }
}

/**
 * Formata quantidade SEMPRE com 3 casas decimais e vírgula brasileira
 * @param quantity Quantidade numérica
 * @returns String formatada (ex: "2,000" ou "1,500")
 */
export function formatarQuantidade(quantity: number): string {
  return quantity.toFixed(3).replace('.', ',');
}

/**
 * Formata nome de produto para exibição em Title Case
 * @param nome Nome do produto em qualquer formato
 * @returns String formatada com primeira letra de cada palavra em maiúscula
 */
export function formatarNomeParaExibicao(nome: string): string {
  if (!nome) return '';
  
  const palavras = nome.toLowerCase().split(' ');
  
  return palavras.map((palavra, index) => {
    // Preposições que devem ficar em minúscula (exceto no início)
    const preposicoes = ['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'em', 'a', 'o', 'e', 'no', 'na'];
    
    if (index > 0 && preposicoes.includes(palavra)) {
      return palavra;
    }
    
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  }).join(' ');
}

/**
 * Formata unidade de medida para exibição
 * @param unidade Unidade de medida (ex: "kg", "g", "un", "l", "ml")
 * @returns String formatada com abreviação correta
 */
export function formatarUnidadeMedida(unidade: string): string {
  if (!unidade) return 'un';
  
  const unidadeLower = unidade.toLowerCase().trim();
  
  // Mapear abreviações comuns
  const mapeamento: Record<string, string> = {
    'kg': 'kg',
    'g': 'g',
    'l': 'L',
    'ml': 'ml',
    'un': 'un',
    'unidade': 'un',
    'unidades': 'un',
    'pct': 'pct',
    'pacote': 'pct',
    'cx': 'cx',
    'caixa': 'cx',
    'dz': 'dz',
    'duzia': 'dz',
    'mg': 'mg',
  };
  
  return mapeamento[unidadeLower] || unidadeLower;
}

/**
 * Formata unidade de medida para exibição em listas de compras.
 * Converte categorias genéricas do banco (PESO, VOLUME, UNIDADE) em abreviações de embalagem.
 */
export function formatarUnidadeListaCompras(unidade: string): string {
  if (!unidade) return 'un';
  const upper = unidade.toUpperCase().trim();
  if (upper === 'PESO') return 'kg';
  if (upper === 'VOLUME') return 'un';
  if (upper === 'UNIDADE') return 'un';
  return formatarUnidadeMedida(unidade);
}
