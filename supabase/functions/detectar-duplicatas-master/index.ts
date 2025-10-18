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

    console.log('🔍 Iniciando detecção inteligente de duplicatas...');

    // Buscar todos os produtos master ativos
    const { data: masters, error: mastersError } = await supabase
      .from('produtos_master_global')
      .select('*')
      .eq('status', 'ativo')
      .order('categoria', { ascending: true })
      .order('total_notas', { ascending: false });

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

    const gruposDuplicatas: any[] = [];
    let grupoIdCounter = 1;

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
          
          // Usar função SQL para calcular similaridade
          const { data: scoreData, error: scoreError } = await supabase
            .rpc('comparar_masters_similares', {
              m1_nome: produto1.nome_padrao,
              m1_marca: produto1.marca,
              m2_nome: produto2.nome_padrao,
              m2_marca: produto2.marca
            });

          if (scoreError) {
            console.error('❌ Erro ao calcular score:', scoreError);
            continue;
          }

          const score = scoreData as number;

          // Threshold de 85% de similaridade
          if (score >= 0.85) {
            console.log(`✅ Duplicata detectada (${Math.round(score * 100)}%):`);
            console.log(`   - ${produto1.nome_padrao} (${produto1.marca || 'sem marca'})`);
            console.log(`   - ${produto2.nome_padrao} (${produto2.marca || 'sem marca'})`);
            
            produtosSimilares.push(produto2);
          }
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

    console.log(`✅ Detecção concluída:`);
    console.log(`   - ${gruposDuplicatas.length} grupo(s) encontrado(s)`);
    console.log(`   - ${totalDuplicatas} produto(s) duplicado(s)`);

    return new Response(
      JSON.stringify({
        grupos: gruposDuplicatas,
        total_grupos: gruposDuplicatas.length,
        total_duplicatas: totalDuplicatas,
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
