import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔍 Iniciando detecção inteligente de duplicatas...', new Date().toISOString());
    const startTime = Date.now();

    // Carregar pares já marcados como não-duplicatas
    console.log('🔍 Carregando decisões de não-duplicatas...');
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
    console.log(`📝 Pares já marcados como não-duplicatas: ${paresIgnoradosSet.size}`);

    // Buscar TODOS os masters ativos (sem filtro de total_notas)
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

    console.log(`📦 Total de masters ativos carregados: ${masters?.length || 0}`);

    // Helper: verificar se par está ignorado
    function parIgnorado(id1: string, id2: string): boolean {
      const [menor, maior] = [id1, id2].sort();
      return paresIgnoradosSet.has(`${menor}_${maior}`);
    }

    // Helper: verificar regras de negócio
    function saoRealmenteDuplicatas(
      p1: any,
      p2: any,
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

    const gruposDuplicatas: any[] = [];
    let grupoIdCounter = 1;
    const produtosJaAgrupados = new Set<string>();

    // =============================================
    // PASSADA 1: Duplicatas EXATAS (case-insensitive)
    // =============================================
    console.log('🔍 PASSADA 1: Buscando duplicatas exatas por nome_padrao...');

    // Agrupar por UPPER(nome_padrao) + UPPER(marca)
    const gruposPorNome = new Map<string, any[]>();
    masters?.forEach(m => {
      const key = `${(m.nome_padrao || '').toUpperCase().trim()}|||${(m.marca || '').toUpperCase().trim()}`;
      if (!gruposPorNome.has(key)) gruposPorNome.set(key, []);
      gruposPorNome.get(key)!.push(m);
    });

    // Também agrupar por nome_base + marca (para pegar variações leves no nome_padrao)
    const gruposPorNomeBase = new Map<string, any[]>();
    masters?.forEach(m => {
      if (m.nome_base) {
        const key = `${m.nome_base.toUpperCase().trim()}|||${(m.marca || '').toUpperCase().trim()}`;
        if (!gruposPorNomeBase.has(key)) gruposPorNomeBase.set(key, []);
        gruposPorNomeBase.get(key)!.push(m);
      }
    });

    // Processar grupos exatos por nome_padrao
    for (const [key, produtos] of gruposPorNome.entries()) {
      if (produtos.length < 2) continue;

      // Filtrar pares ignorados e regras de negócio
      const grupoFiltrado = [produtos[0]];
      for (let i = 1; i < produtos.length; i++) {
        const p = produtos[i];
        if (parIgnorado(produtos[0].id, p.id)) continue;
        if (!saoRealmenteDuplicatas(produtos[0], p, { ignorarCategoria: true })) continue;
        grupoFiltrado.push(p);
      }

      if (grupoFiltrado.length < 2) continue;

      // Ordenar: mais notas primeiro, depois mais antigo
      grupoFiltrado.sort((a, b) => {
        if ((b.total_notas || 0) !== (a.total_notas || 0)) return (b.total_notas || 0) - (a.total_notas || 0);
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      gruposDuplicatas.push({
        id: `grupo_${grupoIdCounter++}`,
        categoria: grupoFiltrado[0].categoria,
        score_similaridade: 1.0, // Exato
        tipo_deteccao: 'exato_nome_padrao',
        produtos: grupoFiltrado.map(p => ({
          id: p.id, nome_padrao: p.nome_padrao, sku_global: p.sku_global,
          marca: p.marca, codigo_barras: p.codigo_barras,
          qtd_valor: p.qtd_valor, qtd_unidade: p.qtd_unidade,
          total_notas: p.total_notas, total_usuarios: p.total_usuarios, created_at: p.created_at
        }))
      });

      grupoFiltrado.forEach(p => produtosJaAgrupados.add(p.id));
    }

    console.log(`✅ Passada 1 (nome_padrao): ${gruposDuplicatas.length} grupos exatos encontrados`);

    // Processar grupos exatos por nome_base (apenas produtos não agrupados ainda)
    const gruposAntes = gruposDuplicatas.length;
    for (const [key, produtos] of gruposPorNomeBase.entries()) {
      // Filtrar já agrupados
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

      grupoFiltrado.sort((a, b) => {
        if ((b.total_notas || 0) !== (a.total_notas || 0)) return (b.total_notas || 0) - (a.total_notas || 0);
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      gruposDuplicatas.push({
        id: `grupo_${grupoIdCounter++}`,
        categoria: grupoFiltrado[0].categoria,
        score_similaridade: 0.98,
        tipo_deteccao: 'exato_nome_base',
        produtos: grupoFiltrado.map(p => ({
          id: p.id, nome_padrao: p.nome_padrao, sku_global: p.sku_global,
          marca: p.marca, codigo_barras: p.codigo_barras,
          qtd_valor: p.qtd_valor, qtd_unidade: p.qtd_unidade,
          total_notas: p.total_notas, total_usuarios: p.total_usuarios, created_at: p.created_at
        }))
      });

      grupoFiltrado.forEach(p => produtosJaAgrupados.add(p.id));
    }

    console.log(`✅ Passada 1 (nome_base): ${gruposDuplicatas.length - gruposAntes} grupos adicionais`);

    // =============================================
    // PASSADA 2: Similaridade (produtos não agrupados)
    // =============================================
    console.log('🔍 PASSADA 2: Buscando duplicatas por similaridade...');

    const mastersNaoAgrupados = masters?.filter(m => !produtosJaAgrupados.has(m.id)) || [];
    console.log(`📦 Produtos restantes para similaridade: ${mastersNaoAgrupados.length}`);

    // Agrupar por categoria
    const mastersPorCategoria = new Map<string, any[]>();
    mastersNaoAgrupados.forEach(m => {
      const cat = m.categoria || 'SEM_CATEGORIA';
      if (!mastersPorCategoria.has(cat)) mastersPorCategoria.set(cat, []);
      mastersPorCategoria.get(cat)!.push(m);
    });

    let comparacoesRealizadas = 0;
    const maxComparacoes = 5000;
    const cache = new Map<string, number>();

    for (const [categoria, produtosCategoria] of mastersPorCategoria.entries()) {
      for (let i = 0; i < produtosCategoria.length; i++) {
        const produto1 = produtosCategoria[i];
        if (produtosJaAgrupados.has(produto1.id)) continue;

        const produtosSimilares: any[] = [produto1];

        for (let j = i + 1; j < produtosCategoria.length; j++) {
          const produto2 = produtosCategoria[j];
          if (produtosJaAgrupados.has(produto2.id)) continue;

          if (parIgnorado(produto1.id, produto2.id)) continue;
          if (!saoRealmenteDuplicatas(produto1, produto2)) continue;
          if (comparacoesRealizadas >= maxComparacoes) break;

          const cacheKey = `${produto1.id}_${produto2.id}`;
          let score: number;

          if (cache.has(cacheKey)) {
            score = cache.get(cacheKey)!;
          } else {
            const { data: scoreData, error: scoreError } = await supabase
              .rpc('comparar_masters_similares', {
                m1_nome: produto1.nome_padrao,
                m1_marca: produto1.marca,
                m1_qtd_valor: produto1.qtd_valor,
                m1_qtd_unidade: produto1.qtd_unidade,
                m2_nome: produto2.nome_padrao,
                m2_marca: produto2.marca,
                m2_qtd_valor: produto2.qtd_valor,
                m2_qtd_unidade: produto2.qtd_unidade
              });

            if (scoreError) { console.error('❌ Erro score:', scoreError); continue; }
            score = scoreData as number;
            cache.set(cacheKey, score);
            comparacoesRealizadas++;
          }

          if (score >= 0.85) {
            produtosSimilares.push(produto2);
          }
        }

        if (comparacoesRealizadas >= maxComparacoes) break;

        if (produtosSimilares.length > 1) {
          const scoresMedios: number[] = [];
          for (let k = 0; k < produtosSimilares.length - 1; k++) {
            const { data: scoreData } = await supabase.rpc('comparar_masters_similares', {
              m1_nome: produtosSimilares[k].nome_padrao,
              m1_marca: produtosSimilares[k].marca,
              m2_nome: produtosSimilares[k + 1].nome_padrao,
              m2_marca: produtosSimilares[k + 1].marca
            });
            scoresMedios.push(scoreData as number);
          }
          const scoreGrupo = scoresMedios.reduce((a, b) => a + b, 0) / scoresMedios.length;

          produtosSimilares.sort((a, b) => {
            if ((b.total_notas || 0) !== (a.total_notas || 0)) return (b.total_notas || 0) - (a.total_notas || 0);
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          });

          gruposDuplicatas.push({
            id: `grupo_${grupoIdCounter++}`,
            categoria,
            score_similaridade: scoreGrupo,
            tipo_deteccao: 'similaridade',
            produtos: produtosSimilares.map(p => ({
              id: p.id, nome_padrao: p.nome_padrao, sku_global: p.sku_global,
              marca: p.marca, codigo_barras: p.codigo_barras,
              qtd_valor: p.qtd_valor, qtd_unidade: p.qtd_unidade,
              total_notas: p.total_notas, total_usuarios: p.total_usuarios, created_at: p.created_at
            }))
          });

          produtosSimilares.forEach(p => produtosJaAgrupados.add(p.id));
          produtosCategoria.splice(i + 1, produtosSimilares.length - 1);
        }
      }
    }

    const totalDuplicatas = gruposDuplicatas.reduce((acc, g) => acc + (g.produtos.length - 1), 0);
    const tempoDecorrido = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Detecção concluída em ${tempoDecorrido}s:`);
    console.log(`   - ${gruposDuplicatas.length} grupo(s) total`);
    console.log(`   - ${totalDuplicatas} produto(s) duplicado(s)`);
    console.log(`   - ${comparacoesRealizadas} comparações por similaridade`);

    return new Response(
      JSON.stringify({
        grupos: gruposDuplicatas,
        total_grupos: gruposDuplicatas.length,
        total_duplicatas: totalDuplicatas,
        comparacoes_realizadas: comparacoesRealizadas,
        tempo_decorrido_s: parseFloat(tempoDecorrido),
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
