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

    // 🆕 BUSCAR PARES JÁ MARCADOS COMO NÃO-DUPLICATAS
    console.log('🔍 Carregando decisões de não-duplicatas...');
    const { data: paresIgnorados, error: ignoradosError } = await supabase
      .from('masters_duplicatas_ignoradas')
      .select('produto_1_id, produto_2_id');

    if (ignoradosError) {
      console.error('⚠️ Erro ao carregar pares ignorados:', ignoradosError);
      // Não bloquear execução, apenas logar
    }

    // Criar Set para lookup rápido O(1)
    const paresIgnoradosSet = new Set<string>();
    paresIgnorados?.forEach(par => {
      const [menor, maior] = [par.produto_1_id, par.produto_2_id].sort();
      paresIgnoradosSet.add(`${menor}_${maior}`);
    });

    console.log(`📝 Total de pares já analisados e marcados como não-duplicatas: ${paresIgnoradosSet.size}`);

    // Buscar apenas produtos master ativos com pelo menos 1 nota (otimização)
    const { data: masters, error: mastersError } = await supabase
      .from('produtos_master_global')
      .select('*')
      .eq('status', 'ativo')
      .gte('total_notas', 1) // Só produtos que têm notas
      .order('categoria', { ascending: true })
      .order('total_notas', { ascending: false })
      .limit(1000); // Limitar a 1000 produtos por execução

    if (mastersError) {
      console.error('❌ Erro ao buscar masters:', mastersError);
      throw mastersError;
    }

    console.log(`📦 Total de masters ativos: ${masters?.length || 0}`);

    // Agrupar por categoria para melhor performance
    const mastersPorCategoria = new Map<string, any[]>();
    
    masters?.forEach(master => {
      const categoria = master.categoria || 'SEM_CATEGORIA';
      if (!mastersPorCategoria.has(categoria)) {
        mastersPorCategoria.set(categoria, []);
      }
      mastersPorCategoria.get(categoria)!.push(master);
    });

    console.log(`📊 Total de categorias: ${mastersPorCategoria.size}`);

    // Função auxiliar para validar se são realmente duplicatas
    function saoRealmenteDuplicatas(p1: any, p2: any): boolean {
      // Regra 1: Gramaturas/volumes diferentes > 15% → NÃO são duplicatas
      if (p1.qtd_valor && p2.qtd_valor && p1.qtd_unidade && p2.qtd_unidade) {
        // Unidades diferentes → definitivamente não são duplicatas
        if (p1.qtd_unidade.toUpperCase() !== p2.qtd_unidade.toUpperCase()) {
          return false;
        }
        
        // Mesma unidade mas valores muito diferentes (>15%)
        const diffPercentual = Math.abs(p1.qtd_valor - p2.qtd_valor) / Math.max(p1.qtd_valor, p2.qtd_valor);
        if (diffPercentual > 0.15) {
          console.log(`⚠️ Produtos com gramaturas diferentes (${(diffPercentual * 100).toFixed(1)}%): ${p1.nome_padrao} (${p1.qtd_valor}${p1.qtd_unidade}) vs ${p2.nome_padrao} (${p2.qtd_valor}${p2.qtd_unidade})`);
          return false;
        }
      }
      
      // Regra 2: Marcas completamente diferentes → NÃO são duplicatas
      if (p1.marca && p2.marca) {
        const marcasIguais = p1.marca.toUpperCase() === p2.marca.toUpperCase();
        if (!marcasIguais) {
          console.log(`⚠️ Marcas diferentes: ${p1.marca} vs ${p2.marca}`);
          return false;
        }
      }
      
      // Regra 3: Categorias diferentes → NÃO são duplicatas
      if (p1.categoria !== p2.categoria) {
        console.log(`⚠️ Categorias diferentes: ${p1.categoria} vs ${p2.categoria}`);
        return false;
      }
      
      return true;
    }

    const gruposDuplicatas: any[] = [];
    let grupoIdCounter = 1;
    let comparacoesRealizadas = 0;
    const maxComparacoes = 5000; // Limite de comparações por execução
    const cache = new Map<string, number>(); // Cache de comparações já feitas

    // Para cada categoria, comparar produtos
    for (const [categoria, produtosCategoria] of mastersPorCategoria.entries()) {
      console.log(`🔍 Analisando categoria: ${categoria} (${produtosCategoria.length} produtos)`);

      // Comparar cada par de produtos dentro da mesma categoria
      for (let i = 0; i < produtosCategoria.length; i++) {
        const produto1 = produtosCategoria[i];
        
        // Array para armazenar produtos similares a este
        const produtosSimilares: any[] = [produto1];
        
        for (let j = i + 1; j < produtosCategoria.length; j++) {
          const produto2 = produtosCategoria[j];
          
          // 🆕 VERIFICAR SE ESSE PAR JÁ FOI MARCADO COMO NÃO-DUPLICATA
          const [idMenor, idMaior] = [produto1.id, produto2.id].sort();
          const parKey = `${idMenor}_${idMaior}`;

          if (paresIgnoradosSet.has(parKey)) {
            console.log(`⏭️ Par já analisado (não-duplicata): ${produto1.nome_padrao} <-> ${produto2.nome_padrao}`);
            continue; // Pular essa comparação
          }
          
          // Verificar se passam nas regras de negócio antes de comparar
          if (!saoRealmenteDuplicatas(produto1, produto2)) {
            continue;
          }
          
          // Verificar limite de comparações
          if (comparacoesRealizadas >= maxComparacoes) {
            console.log(`⚠️ Limite de ${maxComparacoes} comparações atingido. Interrompendo.`);
            break;
          }
          
          // Verificar cache
          const cacheKey = `${produto1.id}_${produto2.id}`;
          let score: number;
          
          if (cache.has(cacheKey)) {
            score = cache.get(cacheKey)!;
          } else {
            // Usar função SQL para calcular similaridade (agora com qtd_valor e qtd_unidade)
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

            if (scoreError) {
              console.error('❌ Erro ao calcular score:', scoreError);
              continue;
            }

            score = scoreData as number;
            cache.set(cacheKey, score);
            comparacoesRealizadas++;
          }

          // Threshold de 85% de similaridade
          if (score >= 0.85) {
            console.log(`✅ Duplicata detectada (${Math.round(score * 100)}%):`);
            console.log(`   - ${produto1.nome_padrao} (${produto1.marca || 'sem marca'})`);
            console.log(`   - ${produto2.nome_padrao} (${produto2.marca || 'sem marca'})`);
            
            produtosSimilares.push(produto2);
          }
        }
        
        // Verificar limite entre categorias também
        if (comparacoesRealizadas >= maxComparacoes) {
          console.log(`⚠️ Limite de comparações atingido. Parando análise.`);
          break;
        }

        // Se encontrou similares (mais de 1 produto), criar grupo
        if (produtosSimilares.length > 1) {
          // Calcular score médio do grupo
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

          // Ordenar produtos por total_notas DESC, created_at ASC
          produtosSimilares.sort((a, b) => {
            if (b.total_notas !== a.total_notas) {
              return b.total_notas - a.total_notas;
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          });

          gruposDuplicatas.push({
            id: `grupo_${grupoIdCounter++}`,
            categoria: categoria,
            score_similaridade: scoreGrupo,
            produtos: produtosSimilares.map(p => ({
              id: p.id,
              nome_padrao: p.nome_padrao,
              sku_global: p.sku_global,
              marca: p.marca,
              qtd_valor: p.qtd_valor,
              qtd_unidade: p.qtd_unidade,
              total_notas: p.total_notas,
              total_usuarios: p.total_usuarios,
              created_at: p.created_at
            }))
          });

          // Remover produtos já agrupados da lista de comparação
          produtosCategoria.splice(i + 1, produtosSimilares.length - 1);
        }
      }
    }

    const totalDuplicatas = gruposDuplicatas.reduce((acc, grupo) => 
      acc + (grupo.produtos.length - 1), 0
    );

    const tempoDecorrido = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Detecção concluída em ${tempoDecorrido}s:`);
    console.log(`   - ${gruposDuplicatas.length} grupo(s) encontrado(s)`);
    console.log(`   - ${totalDuplicatas} produto(s) duplicado(s)`);
    console.log(`   - ${comparacoesRealizadas} comparações realizadas`);
    console.log(`   - ${cache.size} comparações em cache`);

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
