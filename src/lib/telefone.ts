/**
 * Utilitário centralizado para telefones brasileiros.
 *
 * Padrão interno de armazenamento: 13 dígitos → "55" + DDD(2) + número(9)
 * Padrão Z-API: enviar o número COM "55" (13 dígitos)
 * Exibição para o usuário: (XX) XXXXX-XXXX (sem +55)
 */

// DDDs válidos no Brasil (2 dígitos, 11–99 excluindo os inexistentes)
const DDDS_INVALIDOS = new Set([
  '20', '23', '25', '26', '29', '30', '36', '39',
  '40', '50', '52', '56', '57', '58', '59',
  '70', '72', '76', '78', '80', '90',
]);

/**
 * Remove qualquer caractere não numérico de uma string.
 */
function limparDigitos(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Normaliza um telefone brasileiro para o formato de 13 dígitos (55 + DDD + número).
 *
 * Aceita entradas com máscara, espaços, +, parênteses, hífens, com ou sem 55.
 * Retorna `null` se o número não puder ser normalizado de forma inequívoca.
 */
export function normalizarTelefoneBR(input: string): string | null {
  const digitos = limparDigitos(input);

  // 11 dígitos → número nacional, adicionar 55
  if (digitos.length === 11) {
    return `55${digitos}`;
  }

  // 13 dígitos começando com 55 → já está no formato correto
  if (digitos.length === 13 && digitos.startsWith('55')) {
    return digitos;
  }

  return null;
}

/**
 * Valida se um número brasileiro é um celular válido.
 *
 * Aceita qualquer formato de entrada (com ou sem 55, com máscara, etc.).
 * Verifica:
 * - DDD existente no Brasil
 * - Nono dígito = 9 (obrigatório para celulares)
 * - Quantidade de dígitos correta
 */
export function validarCelularBR(input: string): boolean {
  const normalizado = normalizarTelefoneBR(input);
  if (!normalizado) return false;

  // normalizado = "55" + DDD(2) + numero(9)
  const ddd = normalizado.substring(2, 4);
  const nono = normalizado.charAt(4);

  if (DDDS_INVALIDOS.has(ddd)) return false;
  const dddNum = parseInt(ddd, 10);
  if (dddNum < 11 || dddNum > 99) return false;
  if (nono !== '9') return false;

  return true;
}

/**
 * Retorna uma mensagem de erro amigável para o usuário.
 * Se o número for válido, retorna `null`.
 */
export function erroTelefoneAmigavel(input: string): string | null {
  const digitos = limparDigitos(input);

  if (digitos.length === 0) {
    return 'Informe o número do WhatsApp';
  }

  // Aceitar 11 ou 13 dígitos
  if (digitos.length < 10) {
    return 'Número muito curto. Digite DDD + número (ex: 21 99999-9999)';
  }

  if (digitos.length === 10) {
    return 'Faltou o nono dígito. Celulares brasileiros têm 9 dígitos após o DDD';
  }

  if (digitos.length === 12) {
    return 'Número com quantidade de dígitos inválida. Não inclua o 55, apenas DDD + número';
  }

  if (digitos.length > 13) {
    return 'Número muito longo. Digite apenas DDD + número (ex: 21 99999-9999)';
  }

  const normalizado = normalizarTelefoneBR(input);
  if (!normalizado) {
    return 'Formato de número inválido. Digite DDD + número (ex: 21 99999-9999)';
  }

  const ddd = normalizado.substring(2, 4);
  const nono = normalizado.charAt(4);

  if (DDDS_INVALIDOS.has(ddd) || parseInt(ddd, 10) < 11 || parseInt(ddd, 10) > 99) {
    return `DDD ${ddd} não existe no Brasil`;
  }

  if (nono !== '9') {
    return 'Celular brasileiro precisa começar com 9 após o DDD';
  }

  return null;
}

/**
 * Formata um número brasileiro para exibição amigável: (XX) XXXXX-XXXX
 *
 * Aceita qualquer formato de entrada. Se inválido, retorna o input original.
 */
export function formatarTelefoneBR(input: string): string {
  const normalizado = normalizarTelefoneBR(input);
  if (!normalizado) {
    // Tentar formatar mesmo sem normalização completa
    const digitos = limparDigitos(input);
    if (digitos.length === 11) {
      return `(${digitos.substring(0, 2)}) ${digitos.substring(2, 7)}-${digitos.substring(7)}`;
    }
    return input;
  }

  // normalizado = "55XXXXXXXXXXX" (13 dígitos)
  const ddd = normalizado.substring(2, 4);
  const parte1 = normalizado.substring(4, 9);
  const parte2 = normalizado.substring(9, 13);

  return `(${ddd}) ${parte1}-${parte2}`;
}

/**
 * Extrai os 11 dígitos nacionais (sem 55) de um número normalizado.
 * Útil para exibir no input sem o prefixo do país.
 */
export function extrairNumeroNacional(input: string): string {
  const normalizado = normalizarTelefoneBR(input);
  if (!normalizado) return limparDigitos(input);
  return normalizado.substring(2); // Remove "55"
}

/**
 * Compara dois números de telefone de forma segura, normalizando ambos.
 */
export function telefonesIguais(a: string, b: string): boolean {
  const na = normalizarTelefoneBR(a);
  const nb = normalizarTelefoneBR(b);
  if (!na || !nb) return false;
  return na === nb;
}
