import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

// Normaliza string para comparação case/acento-insensível (mesma semântica usada
// pela função SQL normalizar_nome_estabelecimento para o match por nome).
function normalizeKey(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(s: string | null | undefined): string {
  if (!s) return "";
  return s.toString().replace(/\D/g, "");
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    console.log('🔍 Iniciando análise de impacto de normalizações (in-memory)');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar normalizações ativas
    const { data: normalizacoes, error: normError } = await supabase
      .from('normalizacoes_estabelecimentos')
      .select('id, nome_original, nome_normalizado, cnpj_original')
      .eq('ativo', true)
      .order('nome_original');

    if (normError) throw normError;

    if (!normalizacoes || normalizacoes.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          total_notas_processadas: 0,
          normalizacoes_ativas: 0,
          total_notas_afetadas: 0,
          impacto: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Carregar TODAS as notas processadas em uma única query (paginação para
    // contornar o limite default de 1000 linhas do PostgREST).
    const PAGE = 1000;
    let from = 0;
    let totalNotasCount = 0;
    type Nota = { id: string; dados_extraidos: any };
    const notas: Nota[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('notas_imagens')
        .select('id, dados_extraidos')
        .eq('processada', true)
        .not('dados_extraidos', 'is', null)
        .range(from, from + PAGE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const n of data) notas.push(n as Nota);
      totalNotasCount += data.length;
      if (data.length < PAGE) break;
      from += PAGE;
    }

    console.log(`📊 Notas carregadas: ${totalNotasCount}`);
    console.log(`📋 Normalizações ativas: ${normalizacoes.length}`);

    // 3. Indexar normalizações por chave (nome normalizado + cnpj opcional).
    // Estratégia de match (mesma semântica da RPC normalizar_nome_estabelecimento):
    //  - Se a regra tem CNPJ, casa apenas notas com o MESMO CNPJ + nome igual.
    //  - Se a regra NÃO tem CNPJ, casa por nome igual independente do CNPJ.
    // Para evitar dupla contagem, primeiro tentamos match com CNPJ (mais específico)
    // e só caímos no genérico se nada bater.
    type Regra = {
      id: string;
      nome_original: string;
      nome_normalizado: string;
      cnpj_original: string | null;
      keyNome: string;
      keyCnpj: string;
    };

    const regras: Regra[] = normalizacoes.map((n: any) => ({
      id: n.id,
      nome_original: n.nome_original,
      nome_normalizado: n.nome_normalizado,
      cnpj_original: n.cnpj_original ?? null,
      keyNome: normalizeKey(n.nome_original),
      keyCnpj: onlyDigits(n.cnpj_original),
    }));

    // Índices: (nome+cnpj) -> regra ; (nome) -> regra (sem cnpj)
    const idxComCnpj = new Map<string, Regra>();
    const idxSoNome = new Map<string, Regra>();
    for (const r of regras) {
      if (r.keyCnpj) {
        idxComCnpj.set(`${r.keyNome}|${r.keyCnpj}`, r);
      } else if (r.keyNome) {
        // Só registra "só nome" se não houver outra regra mais específica com CNPJ
        // para o mesmo nome. Regras com CNPJ têm precedência.
        if (!idxSoNome.has(r.keyNome)) idxSoNome.set(r.keyNome, r);
      }
    }

    // 4. Passar uma única vez por todas as notas e contar quantas batem em cada regra.
    const contagem = new Map<string, number>(); // regra.id -> count
    let totalNotasAfetadas = 0;

    for (const nota of notas) {
      const dados = nota.dados_extraidos as any;
      if (!dados) continue;

      const nomeNota =
        dados?.supermercado?.nome ||
        dados?.estabelecimento?.nome ||
        dados?.emitente?.nome;

      if (!nomeNota || typeof nomeNota !== 'string') continue;

      const cnpjNota =
        dados?.estabelecimento?.cnpj ||
        dados?.emitente?.cnpj ||
        dados?.supermercado?.cnpj;

      const keyNome = normalizeKey(nomeNota);
      const keyCnpj = onlyDigits(cnpjNota);

      // Tenta match específico (nome + cnpj) primeiro
      let regra: Regra | undefined;
      if (keyCnpj) {
        regra = idxComCnpj.get(`${keyNome}|${keyCnpj}`);
      }
      // Fallback: regra só por nome
      if (!regra) {
        regra = idxSoNome.get(keyNome);
      }

      if (!regra) continue;

      // Só conta se o nome efetivamente mudaria (mesma semântica do filtro original
      // "nomeNormalizado !== nomeNota" da implementação anterior).
      if (normalizeKey(regra.nome_normalizado) === keyNome) continue;

      contagem.set(regra.id, (contagem.get(regra.id) ?? 0) + 1);
      totalNotasAfetadas++;
    }

    // 5. Montar payload
    const impacto = regras
      .filter((r) => (contagem.get(r.id) ?? 0) > 0)
      .map((r) => ({
        id: r.id,
        nome_original: r.nome_original,
        nome_normalizado: r.nome_normalizado,
        notas_afetadas: contagem.get(r.id) ?? 0,
      }))
      .sort((a, b) => b.notas_afetadas - a.notas_afetadas);

    const resultado = {
      success: true,
      total_notas_processadas: totalNotasCount,
      normalizacoes_ativas: normalizacoes.length,
      total_notas_afetadas: totalNotasAfetadas,
      impacto,
    };

    console.log('🎯 Análise concluída:', {
      total_notas_processadas: resultado.total_notas_processadas,
      normalizacoes_ativas: resultado.normalizacoes_ativas,
      total_notas_afetadas: resultado.total_notas_afetadas,
      regras_com_impacto: impacto.length,
    });

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro fatal:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message ?? String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
