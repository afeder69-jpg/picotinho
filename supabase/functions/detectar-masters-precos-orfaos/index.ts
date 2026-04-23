// Detecta pares (master órfão de preço ↔ master irmão com preço) globalmente.
// Master-only, somente leitura. Usado pelo relatório administrativo
// "Masters Órfãos de Preço" no NormalizacaoGlobal.
//
// Critério estrito (sem fuzzy): mesma marca + mesmo nome_base + mesma qtd_valor
// + mesma unidade_base + mesmos tokens de variante.
//
// Pares já presentes em masters_duplicatas_ignoradas são excluídos.
// Pares com bloqueio (variante divergente, qtd divergente, EAN divergente)
// são incluídos mas marcados como bloqueio para revisão somente leitura.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

// ============================================================
// Constantes compartilhadas com comparar-precos-lista
// (mantidas em sincronia manual para evitar coupling de import)
// ============================================================
const TOKENS_VARIANTE = new Set([
  'ZERO', 'DIET', 'LIGHT', 'INTEGRAL', 'DESNATADO', 'SEMIDESNATADO',
  'INTEGRA', 'ORGANICO', 'ORGANICA',
  'MULTIUSO', 'BACTERICIDA', 'NEUTRO', 'NEUTRA',
  'AMACIANTE', 'CONCENTRADO',
  'COCA', 'GUARANA', 'UVA', 'LARANJA', 'LIMAO', 'MORANGO', 'CHOCOLATE',
  'BAUNILHA', 'COCO', 'AMENDOIM', 'MENTA',
  'PERU', 'FRANGO', 'BOVINO', 'SUINO', 'PEIXE',
  'ACO', 'INOX', 'PLASTICO', 'VIDRO',
  'ROSE', 'ROSA', 'BRANCO', 'TINTO',
  'CALABRESA', 'PORTUGUESA', 'MUSSARELA', 'MARGUERITA',
  'PARBOILIZADO', 'AGULHINHA', 'ARBORIO',
  'EXTRAFORTE',
]);

// Stopwords gramaticais (preposições/artigos) — sempre removidas dos tokens.
const STOPWORDS = new Set(['DE', 'DO', 'DA', 'DOS', 'DAS', 'COM', 'SEM', 'EM', 'POR', 'PARA']);

// Tokens absorvíveis — lista MÍNIMA validada caso a caso.
// Cada entrada precisa ter par real documentado e revisão manual antes de adicionar.
// NÃO ampliar sem evidência concreta. Variantes reais ficam em TOKENS_VARIANTE.
//
// Casos validados:
//   SEMOLA, NINHO  → MACARRÃO FETUCCINE SANTA AMÁLIA 500G (fragmentação de nome_base)
//   COTT, FD, N    → PAPEL HIGIÊNICO DELUXE COTTON FOLD 30M 24UN (fragmentação de marca)
const TOKENS_ABSORVIVEIS = new Set([
  'SEMOLA', 'NINHO',
  'COTT', 'FD', 'N',
]);

function normalizarTexto(s: string): string {
  return (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensVariante(s: string): Set<string> {
  const tokens = normalizarTexto(s).split(' ').filter(t => t.length > 2);
  const out = new Set<string>();
  for (const t of tokens) if (TOKENS_VARIANTE.has(t)) out.add(t);
  return out;
}

function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

interface Master {
  id: string;
  nome_padrao: string;
  nome_base: string | null;
  marca: string | null;
  qtd_valor: number | null;
  unidade_base: string | null;
  qtd_unidade: string | null;
  codigo_barras: string | null;
  categoria: string | null;
  imagem_url: string | null;
  total_notas: number | null;
  total_usuarios: number | null;
}

interface Par {
  master_orfao: Master & { total_precos: number; total_vinculos_listas: number; total_vinculos_estoque: number };
  master_com_precos: Master & { total_precos: number; total_vinculos_listas: number; total_vinculos_estoque: number };
  bloqueios: string[];
  score_similaridade: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    console.log('🔎 [detectar-masters-precos-orfaos] iniciando varredura global');

    // 1. Carregar todos os masters ativos com chaves potenciais de agrupamento.
    const { data: masters, error: errMasters } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao, nome_base, marca, qtd_valor, unidade_base, qtd_unidade, codigo_barras, categoria, imagem_url, total_notas, total_usuarios, status')
      .eq('status', 'ativo');

    if (errMasters) throw errMasters;
    if (!masters || masters.length === 0) {
      return new Response(JSON.stringify({ pares: [], total: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📦 ${masters.length} masters ativos carregados`);

    // 2. Agrupar por chave estrita: marca + nome_base + qtd_valor + unidade_base.
    // Apenas grupos com 2+ entradas são candidatos a pares órfão↔com-preços.
    const grupos = new Map<string, Master[]>();
    for (const m of masters as Master[]) {
      const marca = (m.marca || '').toUpperCase().trim();
      const nomeBase = (m.nome_base || '').toUpperCase().trim();
      if (!marca || !nomeBase) continue; // grupo só forma com chave consistente
      const qtd = m.qtd_valor != null ? String(Math.round(m.qtd_valor * 1000)) : 'X';
      const un = (m.unidade_base || '').toUpperCase().trim() || 'X';
      const key = `${marca}|${nomeBase}|${qtd}|${un}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(m);
    }

    const gruposCandidatos = Array.from(grupos.values()).filter(g => g.length >= 2);
    console.log(`🧩 ${gruposCandidatos.length} grupos com 2+ masters`);

    if (gruposCandidatos.length === 0) {
      return new Response(JSON.stringify({ pares: [], total: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Para todos os IDs envolvidos, calcular contagem de preços, vínculos em listas e estoque.
    const idsEnvolvidos = Array.from(new Set(gruposCandidatos.flat().map(m => m.id)));

    const [precosCount, listasCount, estoqueCount, ignorados] = await Promise.all([
      contarPorMasterId(supabase, 'precos_atuais', 'produto_master_id', idsEnvolvidos),
      contarPorMasterId(supabase, 'listas_compras_itens', 'produto_id', idsEnvolvidos),
      contarPorMasterId(supabase, 'estoque_app', 'produto_master_id', idsEnvolvidos),
      carregarIgnorados(supabase),
    ]);

    // 4. Para cada grupo, montar pares (órfão × com-preços) e aplicar regra de bloqueios.
    const pares: Par[] = [];

    for (const grupo of gruposCandidatos) {
      const enriched = grupo.map(m => ({
        ...m,
        total_precos: precosCount.get(m.id) || 0,
        total_vinculos_listas: listasCount.get(m.id) || 0,
        total_vinculos_estoque: estoqueCount.get(m.id) || 0,
      }));

      const orfaos = enriched.filter(m =>
        m.total_precos === 0 &&
        (m.total_vinculos_listas > 0 || m.total_vinculos_estoque > 0 || (m.total_notas || 0) > 0)
      );
      const comPrecos = enriched.filter(m => m.total_precos > 0);

      if (orfaos.length === 0 || comPrecos.length === 0) continue;

      for (const orfao of orfaos) {
        for (const destino of comPrecos) {
          if (orfao.id === destino.id) continue;

          // Excluir pares já marcados como ignorados (independente da ordem)
          const chaveIgnorado1 = `${orfao.id}|${destino.id}`;
          const chaveIgnorado2 = `${destino.id}|${orfao.id}`;
          if (ignorados.has(chaveIgnorado1) || ignorados.has(chaveIgnorado2)) continue;

          // Calcular bloqueios
          const bloqueios: string[] = [];

          // EAN divergente (só bloqueia se ambos têm EAN diferente)
          if (orfao.codigo_barras && destino.codigo_barras &&
              orfao.codigo_barras !== destino.codigo_barras) {
            bloqueios.push('ean_divergente');
          }

          // Quantidade divergente (já é improvável dada a chave de agrupamento, mas mantemos defensivo)
          if (orfao.qtd_valor !== destino.qtd_valor) {
            bloqueios.push('qtd_divergente');
          }

          // Variantes divergentes — set de tokens de variante deve coincidir EXATAMENTE
          const varOrfao = tokensVariante(orfao.nome_padrao || '');
          const varDest = tokensVariante(destino.nome_padrao || '');
          if (!setEquals(varOrfao, varDest)) {
            bloqueios.push('variante_divergente');
          }

          // Score de similaridade simples (Jaccard sobre tokens significativos)
          const score = jaccard(orfao.nome_padrao || '', destino.nome_padrao || '');

          pares.push({
            master_orfao: orfao,
            master_com_precos: destino,
            bloqueios,
            score_similaridade: Number(score.toFixed(3)),
          });
        }
      }
    }

    // Ordenar: seguros primeiro (sem bloqueios + score alto), bloqueados ao final
    pares.sort((a, b) => {
      if (a.bloqueios.length !== b.bloqueios.length) return a.bloqueios.length - b.bloqueios.length;
      return b.score_similaridade - a.score_similaridade;
    });

    console.log(`✅ Detecção concluída: ${pares.length} pares (${pares.filter(p => p.bloqueios.length === 0).length} seguros, ${pares.filter(p => p.bloqueios.length > 0).length} bloqueados)`);

    return new Response(
      JSON.stringify({
        pares,
        total: pares.length,
        seguros: pares.filter(p => p.bloqueios.length === 0).length,
        bloqueados: pares.filter(p => p.bloqueios.length > 0).length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('❌ [detectar-masters-precos-orfaos] erro:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Conta linhas por master_id de uma tabela usando chunks (evita IN gigante).
async function contarPorMasterId(
  supabase: any,
  tabela: string,
  coluna: string,
  ids: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  // Inicializa com zero para todos
  for (const id of ids) out.set(id, 0);

  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from(tabela)
      .select(coluna)
      .in(coluna, slice);
    if (error) {
      console.warn(`⚠️ erro contando ${tabela}.${coluna}:`, error.message);
      continue;
    }
    for (const row of data || []) {
      const id = (row as any)[coluna];
      if (id) out.set(id, (out.get(id) || 0) + 1);
    }
  }
  return out;
}

async function carregarIgnorados(supabase: any): Promise<Set<string>> {
  const { data } = await supabase
    .from('masters_duplicatas_ignoradas')
    .select('produto_1_id, produto_2_id');
  const out = new Set<string>();
  for (const r of data || []) {
    out.add(`${r.produto_1_id}|${r.produto_2_id}`);
  }
  return out;
}

function jaccard(a: string, b: string): number {
  const ta = new Set(normalizarTexto(a).split(' ').filter(t => t.length > 2));
  const tb = new Set(normalizarTexto(b).split(' ').filter(t => t.length > 2));
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}
