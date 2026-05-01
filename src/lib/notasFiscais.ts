/**
 * notasFiscais.ts — Fonte única de verdade para datas e valores de notas fiscais.
 *
 * REGRAS CANÔNICAS (não alterar sem revisão de produto):
 *  - Fonte ÚNICA de DATA da nota: data oficial da compra/NF
 *      (dados_extraidos.compra.data_emissao || dados_extraidos.dataCompra).
 *      NUNCA usar created_at / updated_at / processing_started_at para classificar mês.
 *  - Fonte ÚNICA de VALOR da nota: valor total oficial da NF
 *      (compra.valor_total || dados_extraidos.valor_total || dados_extraidos.valorTotal).
 *      Soma item-a-item é apenas fallback quando o total oficial não existir.
 *
 * Estas regras garantem que "Minhas Notas" e "Relatórios" batam exatamente
 * por mês e no total geral.
 */

/**
 * Extrai a data oficial da compra (YYYY-MM-DD) a partir dos dados_extraidos.
 * Aceita ISO 8601 (YYYY-MM-DDTHH:mm:ss) e formato brasileiro (DD/MM/YYYY[ HH:mm[:ss]]).
 * Retorna string vazia se não conseguir extrair — o chamador deve decidir o que fazer.
 */
export function extrairDataCompraISO(dadosExtraidos: any): string {
  if (!dadosExtraidos) return '';

  const raw: string | undefined =
    dadosExtraidos?.compra?.data_emissao ||
    dadosExtraidos?.compra?.data_compra ||
    dadosExtraidos?.dataCompra ||
    dadosExtraidos?.data_emissao;

  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';

  // ISO 8601: YYYY-MM-DD[Thh:mm:ss...]
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Brasileiro: DD/MM/YYYY[ HH:mm:ss]
  const brMatch = s.split(/\s+/)[0].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Última tentativa: deixar o Date parsear (cobre formatos esquisitos com timezone)
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

/**
 * Retorna o valor total oficial da nota fiscal.
 * Hierarquia (FONTE ÚNICA DE VALOR):
 *   1. dados_extraidos.compra.valor_total
 *   2. dados_extraidos.valor_total
 *   3. dados_extraidos.valorTotal (formato antigo)
 *   4. Soma de itens (apenas fallback) usando item.valor_total quando existir,
 *      ou (quantidade * valor_unitario) caso contrário.
 * Retorna null se nada puder ser calculado.
 */
export function extrairValorTotalNota(dadosExtraidos: any): number | null {
  if (!dadosExtraidos) return null;

  const candidatos = [
    dadosExtraidos?.compra?.valor_total,
    dadosExtraidos?.valor_total,
    dadosExtraidos?.valorTotal,
  ];
  for (const c of candidatos) {
    const n = typeof c === 'string' ? parseFloat(c) : c;
    if (typeof n === 'number' && !isNaN(n) && n > 0) return n;
  }

  // Fallback: somar itens
  const itens: any[] = dadosExtraidos?.itens || dadosExtraidos?.produtos || [];
  if (Array.isArray(itens) && itens.length > 0) {
    const soma = itens.reduce((acc, item) => {
      const valorItem = (() => {
        if (item?.valor_total != null) {
          const v = typeof item.valor_total === 'string' ? parseFloat(item.valor_total) : item.valor_total;
          if (typeof v === 'number' && !isNaN(v)) return v;
        }
        const q = parseFloat(item?.quantidade ?? 0);
        const vu = parseFloat(item?.valor_unitario ?? 0);
        return Math.round(q * vu * 100) / 100;
      })();
      return acc + (valorItem || 0);
    }, 0);
    return soma > 0 ? Math.round(soma * 100) / 100 : null;
  }

  return null;
}

/**
 * Retorna o valor de um item de nota fiscal, priorizando item.valor_total
 * (preserva descontos/arredondamentos do SEFAZ) e caindo para qtd * unit.
 */
export function extrairValorItem(item: any): number {
  if (!item) return 0;
  if (item.valor_total != null) {
    const v = typeof item.valor_total === 'string' ? parseFloat(item.valor_total) : item.valor_total;
    if (typeof v === 'number' && !isNaN(v)) return v;
  }
  const q = parseFloat(item?.quantidade ?? 0);
  const vu = parseFloat(item?.valor_unitario ?? 0);
  return Math.round(q * vu * 100) / 100;
}

/* ============================================================
 * Tratamento padronizado de erros do edge `process-url-nota`
 * ============================================================
 * Frontend: extrai body estruturado de erros vindos do SDK Supabase
 * (FunctionsHttpError) e classifica para exibir toast amigável.
 * Usado por BottomNavigation, NFCeWebViewer e InternalWebViewer.
 */

export interface ErroProcessUrlNota {
  codigo: string;       // ex: 'EXTRACAO_FALHOU', 'NOTA_DUPLICADA', '' (desconhecido)
  mensagem: string;     // mensagem amigável vinda do backend (ou fallback)
  reason: string;       // ex: 'SEFAZ_INSTAVEL', '' (não classificado)
}

/**
 * Interpreta um erro retornado por `supabase.functions.invoke('process-url-nota', ...)`.
 * Tenta extrair o body JSON do FunctionsHttpError em três fallbacks:
 *  1. error.context.body como string → JSON.parse
 *  2. error.context.body como objeto → uso direto
 *  3. error.context.json() quando disponível
 * Sempre retorna um objeto seguro (campos podem ser strings vazias).
 */
export async function interpretarErroProcessUrlNota(error: any): Promise<ErroProcessUrlNota> {
  const resultado: ErroProcessUrlNota = { codigo: '', mensagem: '', reason: '' };
  if (!error) return resultado;

  try {
    const ctx = (error as any)?.context;
    let body: any = null;

    if (ctx?.body != null) {
      if (typeof ctx.body === 'string') {
        try { body = JSON.parse(ctx.body); } catch { /* ignore */ }
      } else if (typeof ctx.body === 'object') {
        body = ctx.body;
      }
    }

    if (!body && ctx && typeof ctx.json === 'function') {
      try { body = await ctx.json(); } catch { /* ignore */ }
    }

    if (body && typeof body === 'object') {
      resultado.codigo = String(body.error || '');
      resultado.mensagem = String(body.message || '');
      resultado.reason = String(body.reason || '');
    }
  } catch { /* ignore parse errors */ }

  // Fallback de mensagem (nunca expor "non-2xx" para o usuário)
  if (!resultado.mensagem) {
    const raw = String((error as any)?.message || '');
    const isGenericSdk =
      raw.includes('non-2xx') || raw.includes('Edge Function') || raw.includes('FunctionsHttpError');
    resultado.mensagem = isGenericSdk
      ? 'Não foi possível processar a nota fiscal. Tente novamente.'
      : raw || 'Não foi possível processar a nota fiscal. Tente novamente.';
  }

  return resultado;
}

/**
 * Padrões que indicam instabilidade SEFAZ/InfoSimples (mesmos usados no backend).
 * Mantido sincronizado com `process-url-nota`.
 */
const PADROES_SEFAZ_INSTAVEL = [
  'sefaz',
  'timeout',
  'time out',
  'time-out',
  'unexpected error',
  'erro inesperado',
  'infosimples error',
  'code 600',
  '"code":600',
  'html vazio',
  'sistema indisponível',
  'sistema indisponivel',
  'indisponível no momento',
  'serviço indisponível',
  'servico indisponivel',
  'gateway timeout',
  '504',
  '503',
];

/**
 * Classifica uma mensagem de erro crua (ex: vinda do campo `erro_mensagem`
 * via realtime, sem o objeto de erro do SDK) usando os mesmos padrões
 * de SEFAZ_INSTAVEL aplicados no backend. Retorna um `ErroProcessUrlNota`
 * compatível com `montarToastErroNota`.
 */
export function classificarMensagemErroNota(mensagemCrua: string | null | undefined): ErroProcessUrlNota {
  const msg = String(mensagemCrua || '').trim();
  const lower = msg.toLowerCase();

  const isSefaz = PADROES_SEFAZ_INSTAVEL.some((p) => lower.includes(p));

  return {
    codigo: 'EXTRACAO_FALHOU',
    mensagem: msg || 'Não conseguimos ler esta nota agora. Tente novamente em instantes.',
    reason: isSefaz ? 'SEFAZ_INSTAVEL' : '',
  };
}

/**
 * Conteúdo padronizado dos toasts amigáveis para falhas do `process-url-nota`.
 * Retorna null quando o erro deve ser tratado fora desse fluxo (ex: NOTA_DUPLICADA).
 */
export function montarToastErroNota(info: ErroProcessUrlNota): {
  title: string;
  description: string;
  duration: number;
  variant?: 'default' | 'destructive';
} | null {
  if (info.codigo === 'NOTA_DUPLICADA') return null; // tratado em fluxo próprio

  if (info.codigo === 'EXTRACAO_FALHOU') {
    if (info.reason === 'SEFAZ_INSTAVEL') {
      return {
        title: '⏳ Consulta indisponível no momento',
        description:
          'Estamos com uma instabilidade na SEFAZ para consultar essa nota agora. Pode aguardar alguns minutos e tentar novamente — normalmente isso se resolve rápido. Se preferir, você pode tentar mais tarde também. Seus dados estão seguros 👍',
        duration: 9000,
      };
    }
    return {
      title: '⚠️ Não foi possível ler a nota',
      description: info.mensagem || 'Não conseguimos ler esta nota agora. Tente novamente em instantes.',
      duration: 8000,
    };
  }

  // Fallback neutro: nunca usar variant destrutivo nesse fluxo
  return {
    title: '⚠️ Não foi possível processar a nota',
    description:
      info.mensagem ||
      'Não conseguimos processar essa nota agora. Tente novamente em alguns instantes.',
    duration: 7000,
  };
}
