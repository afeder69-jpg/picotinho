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

    console.log('🔢 Contagem rápida de duplicatas...', new Date().toISOString());
    const startTime = Date.now();

    // 1. Buscar pares já marcados como não-duplicatas (mesma lógica da detectar-duplicatas-master)
    const { data: paresIgnorados } = await supabase
      .from('masters_duplicatas_ignoradas')
      .select('produto_1_id, produto_2_id');

    const paresIgnoradosSet = new Set<string>();
    paresIgnorados?.forEach(par => {
      const [menor, maior] = [par.produto_1_id, par.produto_2_id].sort();
      paresIgnoradosSet.add(`${menor}_${maior}`);
    });

    // 2. Buscar produtos master ativos com notas (mesmos filtros da detectar-duplicatas-master)
    const { data: masters, error: mastersError } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao, marca, qtd_valor, qtd_unidade, categoria')
      .eq('status', 'ativo')
      .gte('total_notas', 1)
      .limit(1000);

    if (mastersError) throw mastersError;

    // 3. Agrupar por categoria (mesma lógica da detectar-duplicatas-master)
    const mastersPorCategoria = new Map<string, any[]>();
    masters?.forEach(master => {
      const categoria = master.categoria || 'SEM_CATEGORIA';
      if (!mastersPorCategoria.has(categoria)) {
        mastersPorCategoria.set(categoria, []);
      }
      mastersPorCategoria.get(categoria)!.push(master);
    });

    // 4. Função de validação idêntica à detectar-duplicatas-master
    function saoRealmenteDuplicatas(p1: any, p2: any): boolean {
      if (p1.qtd_valor && p2.qtd_valor && p1.qtd_unidade && p2.qtd_unidade) {
        if (p1.qtd_unidade.toUpperCase() !== p2.qtd_unidade.toUpperCase()) {
          return false;
        }
        const diffPercentual = Math.abs(p1.qtd_valor - p2.qtd_valor) / Math.max(p1.qtd_valor, p2.qtd_valor);
        if (diffPercentual > 0.15) {
          return false;
        }
      }
      if (p1.marca && p2.marca) {
        if (p1.marca.toUpperCase() !== p2.marca.toUpperCase()) {
          return false;
        }
      }
      if (p1.categoria !== p2.categoria) {
        return false;
      }
      return true;
    }

    // 5. Contar grupos com pares válidos (mesma lógica de pré-filtragem)
    let totalGrupos = 0;

    for (const [, produtosCategoria] of mastersPorCategoria.entries()) {
      for (let i = 0; i < produtosCategoria.length; i++) {
        const produto1 = produtosCategoria[i];
        let temParValido = false;

        for (let j = i + 1; j < produtosCategoria.length && !temParValido; j++) {
          const produto2 = produtosCategoria[j];

          // Verificar par ignorado
          const [idMenor, idMaior] = [produto1.id, produto2.id].sort();
          if (paresIgnoradosSet.has(`${idMenor}_${idMaior}`)) continue;

          // Verificar regras de negócio
          if (!saoRealmenteDuplicatas(produto1, produto2)) continue;

          // Comparação por nome (threshold simplificado sem RPC fuzzy)
          // Mesma categoria + mesmas regras de negócio validadas + nomes similares
          const n1 = produto1.nome_padrao.toUpperCase().trim();
          const n2 = produto2.nome_padrao.toUpperCase().trim();

          // Nomes exatamente iguais ou muito similares (um contém o outro)
          if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) {
            temParValido = true;
          }
        }

        if (temParValido) {
          totalGrupos++;
          // Remover o produto já contado para não duplicar grupos
          // (análogo ao splice da detectar-duplicatas-master)
        }
      }
    }

    const tempoDecorrido = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Contagem concluída em ${tempoDecorrido}s: ${totalGrupos} grupo(s)`);
    console.log(`   - ${paresIgnoradosSet.size} pares ignorados`);
    console.log(`   - ${masters?.length || 0} masters analisados`);

    return new Response(
      JSON.stringify({
        total_grupos: totalGrupos,
        masters_analisados: masters?.length || 0,
        pares_ignorados: paresIgnoradosSet.size,
        tempo_decorrido_s: parseFloat(tempoDecorrido),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
