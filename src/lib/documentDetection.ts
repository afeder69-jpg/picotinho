/**
 * Utilitários para detectar tipo de documento fiscal (NFe vs NFCe)
 */

export type TipoDocumento = 'NFe' | 'NFCe' | null;

/**
 * Extrai a chave de acesso de uma URL de QR Code
 */
export function extrairChaveNFe(url: string): string | null {
  try {
    // Formato: https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=CHAVE|...
    const urlObj = new URL(url);
    const params = urlObj.searchParams.get('p') || urlObj.searchParams.get('chNFe');
    
    if (params) {
      const chave = params.split('|')[0];
      if (chave && chave.length === 44) {
        return chave;
      }
    }
    
    // Tentar extrair da própria URL
    const match = url.match(/(\d{44})/);
    if (match) {
      return match[1];
    }
    
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
