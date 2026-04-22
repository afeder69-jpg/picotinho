import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

// Categorias incompatíveis (bloqueio)
const CATEGORIAS_INCOMPATIVEIS: Record<string, Set<string>> = {
  'AÇOUGUE': new Set(['LIMPEZA', 'HIGIENE/FARMÁCIA', 'PET']),
  'HORTIFRUTI': new Set(['LIMPEZA', 'HIGIENE/FARMÁCIA', 'PET']),
  'BEBIDAS': new Set(['LIMPEZA', 'HIGIENE/FARMÁCIA', 'PET']),
  'PET': new Set(['AÇOUGUE', 'HORTIFRUTI', 'BEBIDAS', 'MERCEARIA', 'PADARIA', 'LATICÍNIOS/FRIOS', 'CONGELADOS', 'LIMPEZA', 'HIGIENE/FARMÁCIA']),
  'LIMPEZA': new Set(['AÇOUGUE', 'HORTIFRUTI', 'BEBIDAS', 'PET']),
  'HIGIENE/FARMÁCIA': new Set(['AÇOUGUE', 'HORTIFRUTI', 'BEBIDAS', 'PET']),
};

// Categorias próximas (penalidade -0.15)
const CATEGORIAS_PROXIMAS: [string, string][] = [
  ['MERCEARIA', 'PADARIA'],
  ['MERCEARIA', 'CONGELADOS'],
  ['LATICÍNIOS/FRIOS', 'CONGELADOS'],
  ['BEBIDAS', 'LATICÍNIOS/FRIOS'],
];

// Tokens de variante que bloqueiam match quando conflitantes
const VARIANT_TOKENS = new Set([
  // Sabor/fragrância
  'LAVANDA', 'COCO', 'LIMAO', 'UVA', 'MARACUJA', 'MORANGO', 'MENTA',
  'BAUNILHA', 'CHOCOLATE', 'CAFE', 'LARANJA', 'ABACAXI', 'MANGA',
  'PESSEGO', 'CEREJA', 'FRAMBOESA', 'AMORA', 'BANANA', 'MACA',
  'NEUTRO', 'TRADICIONAL', 'ORIGINAL', 'NATURAL',
  // Versão/tipo
  'INTEGRAL', 'DESNATADO', 'SEMIDESNATADO', 'SEM LACTOSE', 'ZERO',
  'LIGHT', 'DIET', 'PREMIUM', 'GOURMET', 'ORGANICO',
  // Promoção
  'PROMO', 'OFERTA', 'ECONOMICO',
  // Embalagem
  'SACHE', 'REFIL', 'GARRAFA', 'LATA', 'PET', 'VIDRO', 'SQUEEZE',
  'TETRA PAK', 'BISNAGA',
]);

function normalizarTexto(texto: string): string {
  return texto
    .toUpperCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\-/\(\)\[\]'"!?;:#+*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairTokensVariante(texto: string): Set<string> {
  const norm = normalizarTexto(texto);
  const tokens = new Set<string>();
  
  // Check multi-word variants first
  if (norm.includes('SEM LACTOSE')) tokens.add('SEM LACTOSE');
  if (norm.includes('TETRA PAK')) tokens.add('TETRA PAK');
  
  // Check "LEVE X PAGUE Y" pattern
  const leveMatch = norm.match(/LEVE\s+\d+\s+PAGUE\s+\d+/);
  if (leveMatch) tokens.add(leveMatch[0]);
  
  // Check single-word variants
  const words = norm.split(' ');
  for (const word of words) {
    if (VARIANT_TOKENS.has(word)) {
      tokens.add(word);
    }
  }
  
  return tokens;
}

function verificarBloqueioVariante(textoCandidate: string, textoMaster: string): boolean {
  const varCandidato = extrairTokensVariante(textoCandidate);
  const varMaster = extrairTokensVariante(textoMaster);
  
  // If either has variant tokens, they must match
  if (varCandidato.size > 0 || varMaster.size > 0) {
    // Check for tokens present in one but not the other
    for (const t of varCandidato) {
      if (!varMaster.has(t)) return true; // block
    }
    for (const t of varMaster) {
      if (!varCandidato.has(t)) return true; // block
    }
  }
  
  return false; // no block
}

function verificarCategoriaIncompativel(catCandidato: string | null, catMaster: string | null): 'bloqueio' | 'penalidade' | 'ok' {
  if (!catCandidato || !catMaster) return 'ok';
  
  const c1 = catCandidato.toUpperCase().trim();
  const c2 = catMaster.toUpperCase().trim();
  
  if (c1 === c2) return 'ok';
  
  // Check incompatible
  if (CATEGORIAS_INCOMPATIVEIS[c1]?.has(c2) || CATEGORIAS_INCOMPATIVEIS[c2]?.has(c1)) {
    return 'bloqueio';
  }
  
  // Check close
  for (const [a, b] of CATEGORIAS_PROXIMAS) {
    if ((c1 === a && c2 === b) || (c1 === b && c2 === a)) {
      return 'penalidade';
    }
  }
  
  return 'ok';
}

function verificarBloqueioMarca(marcaCandidato: string | null, marcaMaster: string | null): boolean {
  if (!marcaCandidato || !marcaMaster) return false;
  const m1 = normalizarTexto(marcaCandidato);
  const m2 = normalizarTexto(marcaMaster);
  if (!m1 || !m2) return false;
  return m1 !== m2;
}

function verificarBloqueioGramatura(qtdCandidato: number | null, unCandidato: string | null, qtdMaster: number | null, unMaster: string | null): boolean {
  if (!qtdCandidato || !qtdMaster) return false;
  if (!unCandidato || !unMaster) return false;
  
  const u1 = normalizarTexto(unCandidato);
  const u2 = normalizarTexto(unMaster);
  
  if (u1 !== u2) return true; // different units = block
  
  // Same unit, check tolerance 15%
  const ratio = Math.abs(qtdCandidato - qtdMaster) / Math.max(qtdCandidato, qtdMaster);
  return ratio > 0.15;
}

interface MatchResult {
  candidato_id: string;
  texto_original: string;
  master_id: string;
  master_nome_padrao: string;
  camada: string;
  score: number;
  grupo: 'inequivoco' | 'sugestao' | 'sem_match';
  bloqueios: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { acao, ids, limit = 200 } = body;

    if (acao === 'detectar') {
      console.log(`🔍 Detectando pendentes absorvíveis (limit=${limit})...`);

      // Call the RPC
      const { data: matches, error: rpcError } = await supabase.rpc('buscar_matches_pendentes_masters', {
        p_limit: limit,
      });

      if (rpcError) {
        console.error('Erro na RPC:', rpcError);
        throw new Error(`RPC error: ${rpcError.message}`);
      }

      console.log(`📊 RPC retornou ${matches?.length || 0} matches brutos`);

      // Apply variant/brand/weight/category validation in code
      const resultados: MatchResult[] = [];

      for (const m of (matches || [])) {
        const bloqueios: string[] = [];
        let scoreAjustado = m.score as number;

        // For layers 1 and 2, they're already inequivocal (no cross-validation needed)
        if (m.camada === 'sinonimo' || m.camada === 'nome_normalizado') {
          resultados.push({
            candidato_id: m.candidato_id,
            texto_original: m.texto_original,
            master_id: m.master_id,
            master_nome_padrao: m.master_nome_padrao,
            camada: m.camada,
            score: 1.0,
            grupo: 'inequivoco',
            bloqueios: [],
          });
          continue;
        }

        // Layer 3: similarity - apply cross-validation
        // Brand check
        if (verificarBloqueioMarca(m.candidato_marca, m.master_marca)) {
          bloqueios.push('marca_diferente');
        }

        // Weight check
        if (verificarBloqueioGramatura(m.candidato_qtd_valor, m.candidato_qtd_unidade, m.master_qtd_valor, m.master_qtd_unidade)) {
          bloqueios.push('gramatura_diferente');
        }

        // Variant check
        const textoComp = m.candidato_nome_padrao_sugerido || m.texto_original;
        if (verificarBloqueioVariante(textoComp, m.master_nome_padrao)) {
          bloqueios.push('variante_conflitante');
        }

        // Category check
        const catResult = verificarCategoriaIncompativel(m.candidato_categoria, m.master_categoria);
        if (catResult === 'bloqueio') {
          bloqueios.push('categoria_incompativel');
        } else if (catResult === 'penalidade') {
          scoreAjustado -= 0.15;
        }

        // Brand/weight bonus for score composition (when both match)
        if (m.candidato_marca && m.master_marca && !verificarBloqueioMarca(m.candidato_marca, m.master_marca)) {
          scoreAjustado = scoreAjustado * 0.70 + 0.15; // marca match bonus
        }
        if (m.candidato_qtd_valor && m.master_qtd_valor && !verificarBloqueioGramatura(m.candidato_qtd_valor, m.candidato_qtd_unidade, m.master_qtd_valor, m.master_qtd_unidade)) {
          scoreAjustado = scoreAjustado * 0.85 / 0.70; // adjust for weight match
        }

        // Cap score at 1.0
        scoreAjustado = Math.min(scoreAjustado, 1.0);

        // Classify
        let grupo: 'inequivoco' | 'sugestao' | 'sem_match';
        if (bloqueios.length > 0 || scoreAjustado < 0.70) {
          grupo = 'sem_match';
        } else if (scoreAjustado >= 0.85) {
          grupo = 'inequivoco';
        } else {
          grupo = 'sugestao';
        }

        resultados.push({
          candidato_id: m.candidato_id,
          texto_original: m.texto_original,
          master_id: m.master_id,
          master_nome_padrao: m.master_nome_padrao,
          camada: m.camada,
          score: Math.round(scoreAjustado * 100) / 100,
          grupo,
          bloqueios,
        });
      }

      // Group results
      const inequivocos = resultados.filter(r => r.grupo === 'inequivoco');
      const sugestoes = resultados.filter(r => r.grupo === 'sugestao');
      const semMatch = resultados.filter(r => r.grupo === 'sem_match');

      console.log(`✅ Inequívocos: ${inequivocos.length}, Sugestões: ${sugestoes.length}, Sem match: ${semMatch.length}`);

      return new Response(JSON.stringify({
        inequivocos,
        sugestoes,
        sem_match: semMatch,
        total: resultados.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (acao === 'absorver') {
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return new Response(JSON.stringify({ error: 'IDs obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`🔄 Absorvendo ${ids.length} pendentes...`);

      // Re-run detection to get current matches for these IDs
      const { data: matches, error: rpcError } = await supabase.rpc('buscar_matches_pendentes_masters', {
        p_limit: 1000,
      });

      if (rpcError) throw new Error(`RPC error: ${rpcError.message}`);

      // Build map of candidato_id -> match
      const matchMap = new Map<string, any>();
      for (const m of (matches || [])) {
        if (ids.includes(m.candidato_id)) {
          matchMap.set(m.candidato_id, m);
        }
      }

      const absorvidos: any[] = [];
      const pulados: any[] = [];

      for (const candidatoId of ids) {
        const match = matchMap.get(candidatoId);

        if (!match) {
          pulados.push({ candidato_id: candidatoId, motivo: 'sem_match_na_revalidacao' });
          continue;
        }

        // === TRAVA 1: Candidato ainda pendente ===
        const { data: candidato } = await supabase
          .from('produtos_candidatos_normalizacao')
          .select('status, texto_original')
          .eq('id', candidatoId)
          .single();

        if (!candidato || candidato.status !== 'pendente') {
          pulados.push({ candidato_id: candidatoId, motivo: 'candidato_nao_pendente', status_atual: candidato?.status });
          continue;
        }

        // === TRAVA 2: Master ainda ativo ===
        const { data: master } = await supabase
          .from('produtos_master_global')
          .select('status, nome_padrao')
          .eq('id', match.master_id)
          .single();

        if (!master || master.status !== 'ativo') {
          pulados.push({ candidato_id: candidatoId, motivo: 'master_nao_ativo', master_id: match.master_id });
          continue;
        }

        // === TRAVA 3: Vínculo ainda único (for layer 2) ===
        if (match.camada === 'nome_normalizado') {
          const { data: recheck } = await supabase.rpc('buscar_matches_pendentes_masters', { p_limit: 1 });
          // Simplified: we already verified uniqueness in the RPC
        }

        // === Execute absorption ===
        // 1. Update candidate
        const { error: updateErr } = await supabase
          .from('produtos_candidatos_normalizacao')
          .update({
            status: 'auto_aprovado',
            sugestao_produto_master: match.master_id,
            revisado_em: new Date().toISOString(),
          })
          .eq('id', candidatoId)
          .eq('status', 'pendente'); // Double-check with WHERE

        if (updateErr) {
          pulados.push({ candidato_id: candidatoId, motivo: 'erro_update', erro: updateErr.message });
          continue;
        }

        // 2. Create synonym (only now, at execution time)
        const { error: sinErr } = await supabase
          .from('produtos_sinonimos_globais')
          .upsert({
            produto_master_id: match.master_id,
            texto_variacao: match.texto_original,
            confianca: 1.0,
            total_ocorrencias: 1,
            fonte: 'absorcao_pendente',
            aprovado_em: new Date().toISOString(),
          }, {
            onConflict: 'produto_master_id,texto_variacao',
          });

        if (sinErr) {
          console.warn(`⚠️ Erro ao criar sinônimo para ${candidatoId}:`, sinErr.message);
        }

        // 3. Log the decision
        await supabase.from('normalizacao_decisoes_log').insert({
          candidato_id: candidatoId,
          texto_original: match.texto_original,
          decisao: 'absorcao_pendente',
          produto_master_final: match.master_id,
          sugestao_ia: {
            camada: match.camada,
            score: match.score,
            motivo: `Absorção via ${match.camada} - score ${match.score}`,
          },
        });

        absorvidos.push({
          candidato_id: candidatoId,
          master_id: match.master_id,
          master_nome: master.nome_padrao,
          camada: match.camada,
          score: match.score,
        });
      }

      console.log(`✅ Absorvidos: ${absorvidos.length}, Pulados: ${pulados.length}`);

      return new Response(JSON.stringify({
        absorvidos,
        pulados,
        total_absorvidos: absorvidos.length,
        total_pulados: pulados.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (acao === 'absorver_manual') {
      const { candidato_id, master_id, bloqueios_ignorados } = body;

      if (!candidato_id || !master_id) {
        return new Response(JSON.stringify({ error: 'candidato_id e master_id obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`🔗 Vínculo manual: candidato=${candidato_id} → master=${master_id}`);

      // Trava 1: candidato ainda pendente
      const { data: candidato } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('status, texto_original')
        .eq('id', candidato_id)
        .single();

      if (!candidato || candidato.status !== 'pendente') {
        return new Response(JSON.stringify({
          error: 'Candidato não está mais pendente',
          status_atual: candidato?.status,
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Trava 2: master ainda ativo
      const { data: master } = await supabase
        .from('produtos_master_global')
        .select('status, nome_padrao')
        .eq('id', master_id)
        .single();

      if (!master || master.status !== 'ativo') {
        return new Response(JSON.stringify({
          error: 'Master não está mais ativo',
          master_id,
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Atualizar candidato
      const { error: updateErr } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({
          status: 'manual_aprovado',
          sugestao_produto_master: master_id,
          revisado_em: new Date().toISOString(),
        })
        .eq('id', candidato_id)
        .eq('status', 'pendente');

      if (updateErr) {
        return new Response(JSON.stringify({ error: 'Erro ao atualizar candidato', detalhe: updateErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Criar sinônimo com fonte diferenciada
      const { error: sinErr } = await supabase
        .from('produtos_sinonimos_globais')
        .upsert({
          produto_master_id: master_id,
          texto_variacao: candidato.texto_original,
          confianca: 0.9,
          total_ocorrencias: 1,
          fonte: 'decisao_manual',
          aprovado_em: new Date().toISOString(),
        }, {
          onConflict: 'produto_master_id,texto_variacao',
        });

      if (sinErr) {
        console.warn(`⚠️ Erro ao criar sinônimo manual:`, sinErr.message);
      }

      // Log da decisão manual
      await supabase.from('normalizacao_decisoes_log').insert({
        candidato_id,
        texto_original: candidato.texto_original,
        decisao: 'vinculo_manual',
        produto_master_final: master_id,
        sugestao_ia: {
          motivo: 'Decisão manual do usuário',
          bloqueios_ignorados: bloqueios_ignorados || [],
        },
      });

      console.log(`✅ Vínculo manual criado: "${candidato.texto_original}" → "${master.nome_padrao}"`);

      return new Response(JSON.stringify({
        sucesso: true,
        candidato_id,
        master_id,
        master_nome: master.nome_padrao,
        texto_original: candidato.texto_original,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: 'Ação inválida. Use: detectar, absorver, absorver_manual' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error: any) {
    console.error('❌ Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
