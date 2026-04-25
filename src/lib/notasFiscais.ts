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
