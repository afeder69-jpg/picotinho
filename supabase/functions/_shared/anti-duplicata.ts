// Bloqueio antecipado de criação de masters por similaridade/match estrutural.
// Retorna {bloquear:true, motivo, candidatos[]} quando deve impedir criar_novo.

export type MotivoBloqueio =
  | 'match_estrutural_forte'
  | 'match_estrutural_medio'
  | 'similaridade_alta';

export interface SugestaoMaster {
  nome_padrao?: string | null;
  nome_base?: string | null;
  marca?: string | null;
  categoria?: string | null;
  qtd_base?: number | null;
  unidade_base?: string | null;
}

export interface ResultadoAntiDuplicata {
  bloquear: boolean;
  motivo?: MotivoBloqueio;
  candidatos: any[];
}

function canonEan(ean?: string | null): string[] {
  if (!ean) return [];
  const limpo = ean.replace(/\D/g, '');
  if (limpo.length < 8) return [];
  const canon = limpo.replace(/^0+/, '') || limpo;
  const set = new Set<string>([canon]);
  for (const len of [8, 12, 13, 14]) if (canon.length <= len) set.add(canon.padStart(len, '0'));
  return Array.from(set);
}

export async function verificarAntiDuplicata(
  supabase: any,
  sugestao: SugestaoMaster,
  codigoBarras?: string | null
): Promise<ResultadoAntiDuplicata> {
  const nomeBase = (sugestao.nome_base || '').trim();
  const nomePadrao = (sugestao.nome_padrao || '').trim();
  const categoria = (sugestao.categoria || '').toUpperCase();

  // 1) Match estrutural forte: EAN igual OU nome_padrao exato (case-insensitive) na categoria
  const eans = canonEan(codigoBarras);
  if (eans.length > 0) {
    const { data } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao, sku_global, codigo_barras, categoria, marca, nome_base, provisorio')
      .in('codigo_barras', eans)
      .eq('status', 'ativo')
      .limit(5);
    if (data && data.length > 0) {
      return { bloquear: true, motivo: 'match_estrutural_forte', candidatos: data };
    }
  }

  if (nomePadrao) {
    const { data } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao, sku_global, categoria, marca, nome_base, provisorio')
      .ilike('nome_padrao', nomePadrao)
      .eq('status', 'ativo')
      .limit(5);
    const filtrados = (data || []).filter((m: any) => !categoria || (m.categoria || '').toUpperCase() === categoria);
    if (filtrados.length > 0) {
      return { bloquear: true, motivo: 'match_estrutural_forte', candidatos: filtrados };
    }
  }

  if (!nomeBase) {
    return { bloquear: false, candidatos: [] };
  }

  // 2) Match estrutural médio: nome_base+marca+categoria iguais
  if (sugestao.marca) {
    const { data } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao, sku_global, categoria, marca, nome_base, qtd_base, unidade_base, provisorio')
      .ilike('nome_base', nomeBase)
      .ilike('marca', sugestao.marca)
      .eq('status', 'ativo')
      .limit(5);
    const filtrados = (data || []).filter((m: any) => !categoria || (m.categoria || '').toUpperCase() === categoria);
    if (filtrados.length > 0) {
      return { bloquear: true, motivo: 'match_estrutural_medio', candidatos: filtrados };
    }
  }

  // 3) Similaridade textual via pg_trgm (>0.75) na mesma categoria
  // Usamos consulta direta com pg_trgm operador % e similarity()
  try {
    const { data, error } = await supabase.rpc('buscar_masters_similares', {
      p_nome_base: nomeBase,
      p_categoria: categoria || null,
      p_threshold: 0.75,
      p_limit: 5,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return { bloquear: true, motivo: 'similaridade_alta', candidatos: data };
    }
  } catch (e) {
    console.warn('anti-duplicata: rpc buscar_masters_similares indisponível, fallback ilike');
  }

  // Fallback: ilike por prefixo do primeiro token (degradado mas seguro)
  const token = nomeBase.split(/\s+/)[0];
  if (token && token.length >= 4) {
    const { data } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao, sku_global, categoria, marca, nome_base, provisorio')
      .ilike('nome_base', `${token}%`)
      .eq('status', 'ativo')
      .limit(20);
    const filtrados = (data || []).filter((m: any) => {
      if (categoria && (m.categoria || '').toUpperCase() !== categoria) return false;
      // similaridade aproximada: jaccard de tokens
      const a = new Set(nomeBase.toLowerCase().split(/\s+/));
      const b = new Set((m.nome_base || '').toLowerCase().split(/\s+/));
      const inter = [...a].filter((x) => b.has(x)).length;
      const uni = new Set([...a, ...b]).size;
      const j = uni === 0 ? 0 : inter / uni;
      return j >= 0.75;
    });
    if (filtrados.length > 0) {
      return { bloquear: true, motivo: 'similaridade_alta', candidatos: filtrados };
    }
  }

  return { bloquear: false, candidatos: [] };
}
