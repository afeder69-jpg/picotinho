/**
 * Utilitários para detectar tipo de documento fiscal (NFe vs NFCe)
 * e validar/processar chaves de acesso de 44 dígitos
 */

export type TipoDocumento = 'NFe' | 'NFCe' | null;

/**
 * Valida uma chave de acesso de 44 dígitos
 */
export function validarChaveAcesso(chave: string): { valida: boolean; erro?: string } {
  // Remover espaços e caracteres não numéricos
  const limpa = chave.replace(/\D/g, '');
  
  if (limpa.length !== 44) {
    return { valida: false, erro: `Chave incompleta: ${limpa.length}/44 dígitos` };
  }
  
  const uf = limpa.substring(0, 2);
  const modelo = limpa.substring(20, 22);
  
  // Verificar UF válida (11-53)
  const ufNum = parseInt(uf, 10);
  if (ufNum < 11 || ufNum > 53) {
    return { valida: false, erro: 'Código de estado inválido' };
  }
  
  // Verificar modelo (55=NFe ou 65=NFCe)
  if (modelo !== '55' && modelo !== '65') {
    return { valida: false, erro: 'Modelo de documento inválido' };
  }
  
  return { valida: true };
}

/**
 * Formata a chave em grupos de 4 dígitos para visualização
 */
export function formatarChaveVisual(chave: string): string {
  const numeros = chave.replace(/\D/g, '');
  const grupos = numeros.match(/.{1,4}/g) || [];
  return grupos.join(' ');
}

/**
 * Constrói uma URL de consulta a partir da chave de acesso
 */
export function construirUrlConsulta(chaveAcesso: string): string {
  const limpa = chaveAcesso.replace(/\D/g, '');
  const modelo = limpa.substring(20, 22);
  
  if (modelo === '65') {
    // NFCe - URL genérica de consulta
    return `https://www.nfce.fazenda.gov.br/portal/consultarNFCe.aspx?chNFe=${limpa}`;
  } else {
    // NFe - URL genérica de consulta
    return `https://www.nfe.fazenda.gov.br/portal/consultarNFe.aspx?chNFe=${limpa}`;
  }
}

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
