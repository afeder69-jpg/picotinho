/**
 * Utilitários para detectar tipo de documento fiscal (NFe vs NFCe)
 * e validar/processar chaves de acesso de 44 dígitos
 */

export type TipoDocumento = 'NFe' | 'NFCe' | null;

export function limparChaveAcesso(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function obterModeloDocumentoPorChave(chave: string): '55' | '65' | null {
  const limpa = limparChaveAcesso(chave);

  if (limpa.length !== 44) {
    return null;
  }

  const modelo = limpa.substring(20, 22);
  return modelo === '55' || modelo === '65' ? modelo : null;
}

export function obterTipoDocumentoPorChave(chave: string): TipoDocumento {
  const modelo = obterModeloDocumentoPorChave(chave);

  if (modelo === '55') return 'NFe';
  if (modelo === '65') return 'NFCe';
  return null;
}

/**
 * Valida uma chave de acesso de 44 dígitos
 */
export function validarChaveAcesso(chave: string): { valida: boolean; erro?: string } {
  const limpa = limparChaveAcesso(chave);

  if (limpa.length !== 44) {
    return { valida: false, erro: `Chave incompleta: ${limpa.length}/44 dígitos` };
  }

  const uf = limpa.substring(0, 2);
  const ufNum = parseInt(uf, 10);
  if (ufNum < 11 || ufNum > 53) {
    return { valida: false, erro: 'Código de estado inválido' };
  }

  if (!obterModeloDocumentoPorChave(limpa)) {
    return { valida: false, erro: 'Modelo de documento inválido' };
  }

  return { valida: true };
}

/**
 * Formata a chave em grupos de 4 dígitos para visualização
 */
export function formatarChaveVisual(chave: string): string {
  const numeros = limparChaveAcesso(chave);
  const grupos = numeros.match(/.{1,4}/g) || [];
  return grupos.join(' ');
}

/**
 * Constrói uma URL de consulta a partir da chave de acesso
 */
export function construirUrlConsulta(chaveAcesso: string): string {
  const limpa = limparChaveAcesso(chaveAcesso);
  const modelo = obterModeloDocumentoPorChave(limpa);

  if (modelo === '65') {
    return `https://www.nfce.fazenda.gov.br/portal/consultarNFCe.aspx?chNFe=${limpa}`;
  }

  return `https://www.nfe.fazenda.gov.br/portal/consultarNFe.aspx?chNFe=${limpa}`;
}

/**
 * Extrai a chave de acesso de uma URL de QR Code
 */
export function extrairChaveNFe(url: string): string | null {
  try {
    const urlSanitizada = decodeURIComponent(url).replace(/[\u0000-\u001F\u007F\s]+/g, '');
    const urlObj = new URL(urlSanitizada);
    const params = urlObj.searchParams.get('p') || urlObj.searchParams.get('chNFe') || urlObj.searchParams.get('chave');

    if (params) {
      const chaveParam = limparChaveAcesso(params.split('|')[0]);
      if (chaveParam.length === 44) {
        return chaveParam;
      }
    }

    const matchDireto = urlSanitizada.match(/(\d{44})/);
    if (matchDireto) {
      return matchDireto[1];
    }

    const todosOsDigitos = urlSanitizada.replace(/\D/g, '');
    if (todosOsDigitos.length === 44) {
      return todosOsDigitos;
    }

    for (let i = 0; i <= todosOsDigitos.length - 44; i++) {
      const candidata = todosOsDigitos.slice(i, i + 44);
      if (validarChaveAcesso(candidata).valida) {
        return candidata;
      }
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

  if (!chave) {
    console.warn('⚠️ Chave NFe inválida ou não encontrada');
    return null;
  }

  const tipoDocumento = obterTipoDocumentoPorChave(chave);
  console.log(`🔍 [DETECÇÃO] Tipo detectado: ${tipoDocumento || 'desconhecido'} (chave: ${chave})`);

  return tipoDocumento;
}
