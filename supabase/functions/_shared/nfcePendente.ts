/**
 * Detecção e tratamento de NFC-e/NFe que ainda não foi autorizada pela SEFAZ
 * (contingência ou aguardando autorização). Usado pelas edge functions
 * process-nfce-infosimples / process-nfe-infosimples / process-url-nota
 * para classificar erros como "pendente" em vez de "falha definitiva".
 */

export class NfcePendenteSefazError extends Error {
  motivo: string;
  detalhe: string;
  constructor(motivo: string, detalhe: string) {
    super(`NFCE_PENDENTE_SEFAZ:${motivo}:${detalhe}`);
    this.name = 'NfcePendenteSefazError';
    this.motivo = motivo;
    this.detalhe = detalhe;
  }
}

/**
 * Códigos InfoSimples que indicam que a SEFAZ ainda não autorizou a nota
 * (geralmente emitida em contingência) - retentar mais tarde.
 *  612 = Documento não localizado
 *  616 = Documento não autorizado
 *  618 = Em processamento na SEFAZ
 */
const CODIGOS_INFOSIMPLES_PENDENTES = new Set([612, 616, 618]);

// Code 600 = "Erro inesperado" do InfoSimples. Tratado como incerteza
// fiscal/consulta indisponível (NÃO falha definitiva), pois pode indicar
// nota em contingência ou consulta SEFAZ temporariamente indisponível.
const CODIGOS_INFOSIMPLES_INCERTOS = new Set([600]);

const PALAVRAS_PENDENTES = [
  'contingência', 'contingencia',
  'não autorizada', 'nao autorizada', 'não autorizado', 'nao autorizado',
  'em processamento',
  'aguardando autorização', 'aguardando autorizacao',
  'documento não localizado', 'documento nao localizado',
  'nfe não localizada', 'nfe nao localizada',
  'nfce não localizada', 'nfce nao localizada',
  'erro inesperado', 'um erro inesperado',
];

export function classificarRespostaInfoSimples(data: any): { pendente: boolean; motivo: string; detalhe: string } {
  const code = Number(data?.code);
  const msg = String(data?.code_message || '').toLowerCase();

  if (CODIGOS_INFOSIMPLES_PENDENTES.has(code)) {
    return { pendente: true, motivo: `infosimples_code_${code}`, detalhe: data?.code_message || '' };
  }
  if (CODIGOS_INFOSIMPLES_INCERTOS.has(code)) {
    return { pendente: true, motivo: `infosimples_code_${code}_incerto`, detalhe: data?.code_message || '' };
  }
  if (PALAVRAS_PENDENTES.some(p => msg.includes(p))) {
    return { pendente: true, motivo: 'sefaz_nao_autorizada', detalhe: data?.code_message || '' };
  }
  return { pendente: false, motivo: '', detalhe: '' };
}

/**
 * Cronograma de retry: 10min, 30min, 1h, 6h, 24h, 24h (total 6 tentativas)
 * Recebe o número de tentativas JÁ realizadas e retorna o próximo timestamp,
 * ou null se atingiu o limite (falha definitiva).
 */
export function calcularProximaTentativa(tentativasJaFeitas: number): Date | null {
  const minutosBackoff = [10, 30, 60, 360, 1440, 1440];
  if (tentativasJaFeitas >= minutosBackoff.length) return null;
  const minutos = minutosBackoff[tentativasJaFeitas];
  return new Date(Date.now() + minutos * 60 * 1000);
}

export const MAX_TENTATIVAS_PENDENTE = 6;
