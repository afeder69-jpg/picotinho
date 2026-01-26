/**
 * Utilitários para detectar tipo de documento fiscal (NFe vs NFCe)
 */

export type TipoDocumento = 'NFe' | 'NFCe' | null;

/**
 * Extrai a chave de acesso de uma URL de QR Code
 */
export function extrairChaveNFe(url: string): string | null {
  try {
    // Primeiro, limpar a URL de caracteres problemáticos
    let urlLimpa = url;
    
    try {
      // Decodificar URL encoding
      urlLimpa = decodeURIComponent(url);
    } catch (e) {
      // Se falhar, continuar com original
    }
    
    // Remover caracteres de controle (ASCII 0-31) e espaços
    urlLimpa = urlLimpa.replace(/[\x00-\x1F]/g, '').replace(/\s+/g, '');
    
    console.log('🔍 [CHAVE] URL limpa para extração:', urlLimpa);
    
    const urlObj = new URL(urlLimpa);
    
    // Tentar múltiplos parâmetros conhecidos: p, chNFe, chave
    const paramNames = ['p', 'chNFe', 'chave'];
    
    for (const paramName of paramNames) {
      const paramValue = urlObj.searchParams.get(paramName);
      if (paramValue) {
        // Limpar o valor do parâmetro (manter apenas dígitos)
        const chave = paramValue.split('|')[0].replace(/\D/g, '');
        if (chave.length === 44) {
          console.log(`✅ [CHAVE] Chave extraída do parâmetro ${paramName}:`, chave);
          return chave;
        }
      }
    }
    
    // Fallback 1: Tentar extrair 44 dígitos consecutivos da URL inteira
    const match = urlLimpa.match(/(\d{44})/);
    if (match) {
      console.log('✅ [CHAVE] Chave extraída via regex 44 dígitos:', match[1]);
      return match[1];
    }
    
    // Fallback 2: Extrair TODOS os dígitos e verificar se somam 44
    const todosDigitos = urlLimpa.replace(/\D/g, '');
    if (todosDigitos.length === 44) {
      console.log('✅ [CHAVE] Chave reconstruída de fragmentos:', todosDigitos);
      return todosDigitos;
    }
    
    // Fallback 3: Se tiver mais de 44, pegar os primeiros 44 após posição comum
    if (todosDigitos.length > 44) {
      // Geralmente a chave começa após alguns dígitos de controle
      // Tentar diferentes offsets
      for (let offset = 0; offset <= todosDigitos.length - 44; offset++) {
        const possibleChave = todosDigitos.substring(offset, offset + 44);
        // Verificar se parece uma chave válida (começa com código de estado: 11-53)
        const codEstado = parseInt(possibleChave.substring(0, 2));
        if (codEstado >= 11 && codEstado <= 53) {
          console.log(`✅ [CHAVE] Chave encontrada no offset ${offset}:`, possibleChave);
          return possibleChave;
        }
      }
    }
    
    console.warn('⚠️ [CHAVE] Não foi possível extrair chave de 44 dígitos');
    return null;
  } catch (error) {
    console.error('❌ Erro ao extrair chave NFe:', error);
    return null;
  }
}

/**
 * Detecta se é NFe (modelo 55) ou NFCe (modelo 65) pela chave de acesso
 * Posição 20-21 da chave = modelo do documento
 */
export function detectarTipoDocumento(url: string): TipoDocumento {
  const chave = extrairChaveNFe(url);
  
  if (!chave || chave.length !== 44) {
    console.warn('⚠️ Chave NFe inválida ou não encontrada');
    return null;
  }
  
  const modelo = chave.substring(20, 22);
  console.log(`🔍 [DETECÇÃO] Modelo detectado: ${modelo} (chave: ${chave})`);
  
  if (modelo === '55') {
    console.log('📄 [NFE] Documento tipo NFe detectado');
    return 'NFe';
  }
  
  if (modelo === '65') {
    console.log('🎫 [NFCE] Documento tipo NFCe detectado');
    return 'NFCe';
  }
  
  console.warn(`⚠️ Modelo desconhecido: ${modelo}`);
  return null;
}
