import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

const BATCH_SIZE = 200;
const MAX_COMPARACOES = 5000;
const THRESHOLD_SIMILARIDADE = 0.85;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startTime = Date.now();
    const tempos: Record<string, number> = {};

    console.log('🔍 Iniciando detecção inteligente de duplicatas...', new Date().toISOString());

    // =============================================
    // CARREGAR PARES IGNORADOS
    // =============================================
    let t0 = Date.now();
    const { data: paresIgnorados, error: ignoradosError } = await supabase
      .from('masters_duplicatas_ignoradas')
      .select('produto_1_id, produto_2_id');

    if (ignoradosError) {
      console.error('⚠️ Erro ao carregar pares ignorados:', ignoradosError);
    }

    const paresIgnoradosSet = new Set<string>();
    paresIgnorados?.forEach(par => {
      const [menor, maior] = [par.produto_1_id, par.produto_2_id].sort();
      paresIgnoradosSet.add(`${menor}_${maior}`);
    });
    tempos['carregar_ignorados'] = Date.now() - t0;
    console.log(`📝 Pares ignorados: ${paresIgnoradosSet.size} (${tempos['carregar_ignorados']}ms)`);

    // =============================================
    // CARREGAR MASTERS ATIVOS
    // =============================================
    t0 = Date.now();
    const { data: masters, error: mastersError } = await supabase
      .from('produtos_master_global')
      .select('*')
      .eq('status', 'ativo')
      .order('categoria', { ascending: true })
      .order('total_notas', { ascending: false })
      .limit(5000);

    if (mastersError) {
      console.error('❌ Erro ao buscar masters:', mastersError);
      throw mastersError;
    }
    tempos['carregar_masters'] = Date.now() - t0;
    console.log(`📦 Masters ativos: ${masters?.length || 0} (${tempos['carregar_masters']}ms)`);

    // =============================================
    // HELPERS
    // =============================================
    function parIgnorado(id1: string, id2: string): boolean {
      const [menor, maior] = [id1, id2].sort();
      return paresIgnoradosSet.has(`${menor}_${maior}`);
    }

    function saoRealmenteDuplicatas(
      p1: any, p2: any,
      options: { ignorarCategoria?: boolean } = {}
    ): boolean {
      if (p1.qtd_valor && p2.qtd_valor && p1.qtd_unidade && p2.qtd_unidade) {
        if (p1.qtd_unidade.toUpperCase() !== p2.qtd_unidade.toUpperCase()) return false;
        const diff = Math.abs(p1.qtd_valor - p2.qtd_valor) / Math.max(p1.qtd_valor, p2.qtd_valor);
        if (diff > 0.15) return false;
      }
      if (p1.marca && p2.marca && p1.marca.toUpperCase() !== p2.marca.toUpperCase()) return false;
      if (!options.ignorarCategoria && p1.categoria !== p2.categoria) return false;
      return true;
    }

    function ordenarPorRelevancia(arr: any[]) {
      arr.sort((a, b) => {
        if ((b.total_notas || 0) !== (a.total_notas || 0)) return (b.total_notas || 0) - (a.total_notas || 0);
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    }

    function mapProduto(p: any) {
      return {
        id: p.id, nome_padrao: p.nome_padrao, sku_global: p.sku_global,
        marca: p.marca, codigo_barras: p.codigo_barras,
        qtd_valor: p.qtd_valor, qtd_unidade: p.qtd_unidade,
        total_notas: p.total_notas, total_usuarios: p.total_usuarios, created_at: p.created_at
      };
    }

    const gruposDuplicatas: any[] = [];
    let grupoIdCounter = 1;
    const produtosJaAgrupados = new Set<string>();

    // =============================================
    // PASSADA 1: Duplicatas EXATAS
    // =============================================
    t0 = Date.now();
    console.log('🔍 PASSADA 1: Buscando duplicatas exatas...');

    // Por nome_padrao + marca
    const gruposPorNome = new Map<string, any[]>();
    masters?.forEach(m => {
      const key = `${(m.nome_padrao || '').toUpperCase().trim()}|||${(m.marca || '').toUpperCase().trim()}`;
      if (!gruposPorNome.has(key)) gruposPorNome.set(key, []);
      gruposPorNome.get(key)!.push(m);
    });

    for (const [, produtos] of gruposPorNome.entries()) {
      if (produtos.length < 2) continue;
      const grupoFiltrado = [produtos[0]];
      for (let i = 1; i < produtos.length; i++) {
        const p = produtos[i];
        if (parIgnorado(produtos[0].id, p.id)) continue;
        if (!saoRealmenteDuplicatas(produtos[0], p, { ignorarCategoria: true })) continue;
        grupoFiltrado.push(p);
      }
      if (grupoFiltrado.length < 2) continue;
      ordenarPorRelevancia(grupoFiltrado);
      gruposDuplicatas.push({
        id: `grupo_${grupoIdCounter++}`, categoria: grupoFiltrado[0].categoria,
        score_similaridade: 1.0, tipo_deteccao: 'exato_nome_padrao',
        produtos: grupoFiltrado.map(mapProduto)
      });
      grupoFiltrado.forEach(p => produtosJaAgrupados.add(p.id));
    }

    const gruposPassada1a = gruposDuplicatas.length;
    console.log(`✅ Passada 1 (nome_padrao): ${gruposPassada1a} grupos`);

    // Por nome_base + marca
    const gruposPorNomeBase = new Map<string, any[]>();
    masters?.forEach(m => {
      if (m.nome_base) {
        const key = `${m.nome_base.toUpperCase().trim()}|||${(m.marca || '').toUpperCase().trim()}`;
        if (!gruposPorNomeBase.has(key)) gruposPorNomeBase.set(key, []);
        gruposPorNomeBase.get(key)!.push(m);
      }
    });

    for (const [, produtos] of gruposPorNomeBase.entries()) {
      const naoAgrupados = produtos.filter(p => !produtosJaAgrupados.has(p.id));
      if (naoAgrupados.length < 2) continue;
      const grupoFiltrado = [naoAgrupados[0]];
      for (let i = 1; i < naoAgrupados.length; i++) {
        const p = naoAgrupados[i];
        if (parIgnorado(naoAgrupados[0].id, p.id)) continue;
        if (!saoRealmenteDuplicatas(naoAgrupados[0], p, { ignorarCategoria: true })) continue;
        grupoFiltrado.push(p);
      }
      if (grupoFiltrado.length < 2) continue;
      ordenarPorRelevancia(grupoFiltrado);
      gruposDuplicatas.push({
        id: `grupo_${grupoIdCounter++}`, categoria: grupoFiltrado[0].categoria,
        score_similaridade: 0.98, tipo_deteccao: 'exato_nome_base',
        produtos: grupoFiltrado.map(mapProduto)
      });
      grupoFiltrado.forEach(p => produtosJaAgrupados.add(p.id));
    }

    tempos['passada_1'] = Date.now() - t0;
    console.log(`✅ Passada 1 (nome_base): ${gruposDuplicatas.length - gruposPassada1a} grupos adicionais (${tempos['passada_1']}ms total)`);

    // =============================================
    // PASSADA 2: Similaridade com BATCH RPC
    // =============================================
    t0 = Date.now();
    console.log('🔍 PASSADA 2: Buscando duplicatas por similaridade (batch)...');

    const mastersNaoAgrupados = masters?.filter(m => !produtosJaAgrupados.has(m.id)) || [];
    console.log(`📦 Produtos restantes para similaridade: ${mastersNaoAgrupados.length}`);

    // Agrupar por categoria
    const mastersPorCategoria = new Map<string, any[]>();
    mastersNaoAgrupados.forEach(m => {
      const cat = m.categoria || 'SEM_CATEGORIA';
      if (!mastersPorCategoria.has(cat)) mastersPorCategoria.set(cat, []);
      mastersPorCategoria.get(cat)!.push(m);
    });

    // Fase 1: Acumular todos os pares candidatos
    interface ParCandidato {
      i: number; // índice do produto1 no array da categoria
      j: number; // índice do produto2 no array da categoria
      cat: string;
      produto1: any;
      produto2: any;
    }

    const paresCandidatos: ParCandidato[] = [];

    for (const [categoria, produtosCategoria] of mastersPorCategoria.entries()) {
      for (let i = 0; i < produtosCategoria.length && paresCandidatos.length < MAX_COMPARACOES; i++) {
        const produto1 = produtosCategoria[i];
        if (produtosJaAgrupados.has(produto1.id)) continue;

        for (let j = i + 1; j < produtosCategoria.length && paresCandidatos.length < MAX_COMPARACOES; j++) {
          const produto2 = produtosCategoria[j];
          if (produtosJaAgrupados.has(produto2.id)) continue;
          if (parIgnorado(produto1.id, produto2.id)) continue;
          if (!saoRealmenteDuplicatas(produto1, produto2)) continue;

          paresCandidatos.push({ i, j, cat: categoria, produto1, produto2 });
        }
      }
    }

    console.log(`📊 Pares candidatos acumulados: ${paresCandidatos.length}`);

    // Fase 2: Processar pares em batches via RPC
    const scores = new Map<string, number>(); // "id1_id2" -> score

    for (let batchStart = 0; batchStart < paresCandidatos.length; batchStart += BATCH_SIZE) {
      const batch = paresCandidatos.slice(batchStart, batchStart + BATCH_SIZE);
      const paresJson = batch.map(p => ({
        m1_nome: p.produto1.nome_padrao,
        m1_marca: p.produto1.marca,
        m2_nome: p.produto2.nome_padrao,
        m2_marca: p.produto2.marca,
      }));

      const { data: batchScores, error: batchError } = await supabase
        .rpc('comparar_masters_similares_batch', { pares: paresJson });

      if (batchError) {
        console.error(`❌ Erro batch ${batchStart}:`, batchError);
        continue;
      }

      batchScores?.forEach((row: { idx: number; score: number }) => {
        const par = batch[row.idx];
        if (par && row.score >= THRESHOLD_SIMILARIDADE) {
          const [id1, id2] = [par.produto1.id, par.produto2.id].sort();
          scores.set(`${id1}_${id2}`, row.score);
        }
      });
    }

    console.log(`⏱️ Batch RPC concluído: ${scores.size} pares acima do threshold (${Date.now() - t0}ms)`);

    // Fase 3: Montar grupos a partir dos scores
    const t1 = Date.now();

    // Build adjacency from scores
    const adjacency = new Map<string, Set<string>>();
    for (const key of scores.keys()) {
      const [id1, id2] = key.split('_');
      if (!adjacency.has(id1)) adjacency.set(id1, new Set());
      if (!adjacency.has(id2)) adjacency.set(id2, new Set());
      adjacency.get(id1)!.add(id2);
      adjacency.get(id2)!.add(id1);
    }

    // Find connected components
    const visitado = new Set<string>();
    const mastersMap = new Map<string, any>();
    masters?.forEach(m => mastersMap.set(m.id, m));

    for (const [startId] of adjacency.entries()) {
      if (visitado.has(startId) || produtosJaAgrupados.has(startId)) continue;

      // BFS
      const componente: string[] = [];
      const fila = [startId];
      while (fila.length > 0) {
        const atual = fila.shift()!;
        if (visitado.has(atual) || produtosJaAgrupados.has(atual)) continue;
        visitado.add(atual);
        componente.push(atual);
        const vizinhos = adjacency.get(atual);
        if (vizinhos) {
          for (const v of vizinhos) {
            if (!visitado.has(v) && !produtosJaAgrupados.has(v)) fila.push(v);
          }
        }
      }

      if (componente.length < 2) continue;

      const produtosGrupo = componente.map(id => mastersMap.get(id)).filter(Boolean);
      if (produtosGrupo.length < 2) continue;

      // Calcular score médio do grupo
      let somaScores = 0;
      let countScores = 0;
      for (let x = 0; x < componente.length; x++) {
        for (let y = x + 1; y < componente.length; y++) {
          const [a, b] = [componente[x], componente[y]].sort();
          const s = scores.get(`${a}_${b}`);
          if (s !== undefined) {
            somaScores += s;
            countScores++;
          }
        }
      }
      const scoreGrupo = countScores > 0 ? somaScores / countScores : 0.85;

      ordenarPorRelevancia(produtosGrupo);

      gruposDuplicatas.push({
        id: `grupo_${grupoIdCounter++}`,
        categoria: produtosGrupo[0].categoria,
        score_similaridade: parseFloat(scoreGrupo.toFixed(3)),
        tipo_deteccao: 'similaridade',
        produtos: produtosGrupo.map(mapProduto)
      });

      produtosGrupo.forEach(p => produtosJaAgrupados.add(p.id));
    }

    tempos['passada_2'] = Date.now() - t0;
    tempos['montagem_grupos'] = Date.now() - t1;

    const totalDuplicatas = gruposDuplicatas.reduce((acc, g) => acc + (g.produtos.length - 1), 0);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Detecção concluída em ${tempoTotal}s:`);
    console.log(`   - ${gruposDuplicatas.length} grupo(s) total`);
    console.log(`   - ${totalDuplicatas} produto(s) duplicado(s)`);
    console.log(`   - ${paresCandidatos.length} comparações realizadas`);
    console.log(`⏱️ Tempos: ${JSON.stringify(tempos)}`);

    return new Response(
      JSON.stringify({
        grupos: gruposDuplicatas,
        total_grupos: gruposDuplicatas.length,
        total_duplicatas: totalDuplicatas,
        comparacoes_realizadas: paresCandidatos.length,
        tempo_decorrido_s: parseFloat(tempoTotal),
        tempos_internos: tempos,
        executado_em: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
