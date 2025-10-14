import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
