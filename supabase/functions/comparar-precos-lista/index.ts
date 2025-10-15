import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Não autenticado');
    }

    const { userId, listaId } = await req.json();

    console.log(`📍 Iniciando comparação para usuário: ${userId}`);

    // Buscar configuração do usuário
    const { data: config } = await supabase
      .from('configuracoes_usuario')
      .select('raio_busca_km')
      .eq('usuario_id', userId)
      .single();

    const raioBusca = config?.raio_busca_km || 5;
    console.log(`📍 Raio de busca: ${raioBusca}km`);

    // Buscar localização do perfil do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .single();

    if (!profile?.latitude || !profile?.longitude) {
      console.log('❌ Usuário sem localização cadastrada no perfil');
      
      // Buscar itens para retornar na resposta
      const { data: itens } = await supabase
        .from('listas_compras_itens')
        .select('*')
        .eq('lista_id', listaId);

      return new Response(
        JSON.stringify({
          otimizado: { total: 0, economia: 0, percentualEconomia: 0, totalMercados: 0, mercados: [] },
          comparacao: {},
          produtosSemPreco: itens || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📍 Localização do usuário: ${profile.latitude}, ${profile.longitude}`);

    // Usar a Edge Function existente que já funciona corretamente
    const { data: resultadoMercados, error: mercadosError } = await supabase.functions.invoke(
      'buscar-supermercados-area',
      {
        body: {
          latitude: profile.latitude,
          longitude: profile.longitude,
          raio: raioBusca,
          userId: userId
        }
      }
    );

    if (mercadosError || !resultadoMercados?.success) {
      console.log('❌ Erro ao buscar mercados:', mercadosError);
      
      // Buscar itens para retornar na resposta
      const { data: itens } = await supabase
        .from('listas_compras_itens')
        .select('*')
        .eq('lista_id', listaId);

      return new Response(
        JSON.stringify({
          otimizado: { total: 0, economia: 0, percentualEconomia: 0, totalMercados: 0, mercados: [] },
          comparacao: {},
          produtosSemPreco: itens || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mercados = (resultadoMercados.supermercados || []).slice(0, 3);
    console.log(`✅ ${mercados.length} mercados encontrados para comparação`);

    // Buscar itens da lista
    const { data: itens, error: itensError } = await supabase
      .from('listas_compras_itens')
      .select('*')
      .eq('lista_id', listaId);

    if (itensError) throw itensError;

    // Se não houver mercados, retornar estrutura vazia
    if (mercados.length === 0) {
      return new Response(
        JSON.stringify({
          otimizado: { total: 0, economia: 0, percentualEconomia: 0, totalMercados: 0, mercados: [] },
          comparacao: {},
          produtosSemPreco: itens
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Função auxiliar para busca inteligente de produtos
    const buscarPrecoInteligente = async (
      userId: string,
      produtoNome: string,
      estabelecimentoNome?: string
    ): Promise<number | null> => {
      const produtoUpper = produtoNome.toUpperCase().trim();
      
      // 1. Tentar busca exata em precos_atuais_usuario
      const { data: precoUsuarioExato } = await supabase
        .from('precos_atuais_usuario')
        .select('valor_unitario')
        .eq('user_id', userId)
        .ilike('produto_nome', produtoUpper)
        .order('data_atualizacao', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (precoUsuarioExato?.valor_unitario) {
        console.log(`  ✅ Preço usuário (exato): R$ ${precoUsuarioExato.valor_unitario}`);
        return precoUsuarioExato.valor_unitario;
      }
      
      // 2. Tentar busca por palavras-chave em precos_atuais_usuario
      const palavrasChave = produtoUpper
        .split(/\s+/)
        .filter(palavra => palavra.length > 2)
        .slice(0, 3);
      
      if (palavrasChave.length > 0) {
        let queryUsuario = supabase
          .from('precos_atuais_usuario')
          .select('valor_unitario, produto_nome')
          .eq('user_id', userId);
        
        palavrasChave.forEach(palavra => {
          queryUsuario = queryUsuario.ilike('produto_nome', `%${palavra}%`);
        });
        
        const { data: precosUsuarioFuzzy } = await queryUsuario
          .order('data_atualizacao', { ascending: false })
          .limit(1);
        
        if (precosUsuarioFuzzy && precosUsuarioFuzzy.length > 0) {
          console.log(`  ✅ Preço usuário (fuzzy): R$ ${precosUsuarioFuzzy[0].valor_unitario} (${precosUsuarioFuzzy[0].produto_nome})`);
          return precosUsuarioFuzzy[0].valor_unitario;
        }
      }
      
      // 3. Tentar busca em precos_atuais com estabelecimento
      if (estabelecimentoNome) {
        const { data: precoGeralExato } = await supabase
          .from('precos_atuais')
          .select('valor_unitario')
          .ilike('estabelecimento_nome', `%${estabelecimentoNome}%`)
          .ilike('produto_nome', produtoUpper)
          .order('data_atualizacao', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (precoGeralExato?.valor_unitario) {
          console.log(`  ✅ Preço geral (exato): R$ ${precoGeralExato.valor_unitario}`);
          return precoGeralExato.valor_unitario;
        }
        
        // 4. Tentar busca fuzzy em precos_atuais
        if (palavrasChave.length > 0) {
          let queryGeral = supabase
            .from('precos_atuais')
            .select('valor_unitario, produto_nome')
            .ilike('estabelecimento_nome', `%${estabelecimentoNome}%`);
          
          palavrasChave.forEach(palavra => {
            queryGeral = queryGeral.ilike('produto_nome', `%${palavra}%`);
          });
          
          const { data: precosGeralFuzzy } = await queryGeral
            .order('data_atualizacao', { ascending: false })
            .limit(1);
          
          if (precosGeralFuzzy && precosGeralFuzzy.length > 0) {
            console.log(`  ✅ Preço geral (fuzzy): R$ ${precosGeralFuzzy[0].valor_unitario} (${precosGeralFuzzy[0].produto_nome})`);
            return precosGeralFuzzy[0].valor_unitario;
          }
        }
      }
      
      // 5. Fallback: buscar qualquer preço semelhante em precos_atuais (sem filtro de estabelecimento)
      if (palavrasChave.length > 0) {
        let queryFallback = supabase
          .from('precos_atuais')
          .select('valor_unitario, produto_nome, estabelecimento_nome');
        
        palavrasChave.forEach(palavra => {
          queryFallback = queryFallback.ilike('produto_nome', `%${palavra}%`);
        });
        
        const { data: precosFallback } = await queryFallback
          .order('data_atualizacao', { ascending: false })
          .limit(1);
        
        if (precosFallback && precosFallback.length > 0) {
          console.log(`  ⚠️ Preço fallback: R$ ${precosFallback[0].valor_unitario} (${precosFallback[0].produto_nome} - ${precosFallback[0].estabelecimento_nome})`);
          return precosFallback[0].valor_unitario;
        }
      }
      
      return null;
    };

    // Buscar preços para cada produto em cada mercado
    const precosPromises = itens.map(async (item) => {
      console.log(`\n🔍 Buscando preços para: ${item.produto_nome}`);
      console.log(`📦 Quantidade: ${item.quantidade} ${item.unidade_medida}`);
      
      const precosMap = new Map();

      for (const mercado of mercados) {
        const nomeNormalizado = mercado.nome?.toUpperCase().trim() || '';
        console.log(`\n🏪 Mercado: ${nomeNormalizado}`);
        
        const preco = await buscarPrecoInteligente(userId, item.produto_nome, nomeNormalizado);
        
        if (preco) {
          precosMap.set(mercado.id, preco);
        } else {
          console.log(`  ❌ Nenhum preço encontrado`);
        }
      }

      return {
        item,
        precos: precosMap
      };
    });

    const precosData = await Promise.all(precosPromises);

    // Calcular cenários
    const produtosSemPreco: any[] = [];

    // CENÁRIO OTIMIZADO
    const mercadosOtimizado = new Map();
    let totalOtimizado = 0;

    precosData.forEach(({ item, precos }) => {
      if (precos.size === 0) {
        produtosSemPreco.push(item);
        return;
      }

      let melhorPreco = Infinity;
      let melhorMercadoId = null;

      precos.forEach((preco, mercadoId) => {
        if (preco < melhorPreco) {
          melhorPreco = preco;
          melhorMercadoId = mercadoId;
        }
      });

      if (melhorMercadoId) {
        if (!mercadosOtimizado.has(melhorMercadoId)) {
          const mercado = mercados.find(m => m.id === melhorMercadoId)!;
          mercadosOtimizado.set(melhorMercadoId, {
            id: mercado.id,
            nome: mercado.nome,
            cnpj: mercado.cnpj,
            distancia: mercado.distancia,
            total: 0,
            produtos: []
          });
        }

        const mercadoData = mercadosOtimizado.get(melhorMercadoId);
        const precoTotal = melhorPreco * item.quantidade;
        
        mercadoData.produtos.push({
          id: item.id,
          produto_nome: item.produto_nome,
          quantidade: item.quantidade,
          unidade_medida: item.unidade_medida,
          preco_unitario: melhorPreco,
          preco_total: precoTotal,
          melhor_preco: true,
          comprado: item.comprado
        });
        
        mercadoData.total += precoTotal;
        totalOtimizado += precoTotal;
      }
    });

    // CENÁRIOS POR MERCADO INDIVIDUAL
    const comparacao: any = {};
    const totaisPorMercado: number[] = [];

    mercados.forEach((mercado, index) => {
      let totalMercado = 0;
      const produtosMercado: any[] = [];
      const label = String.fromCharCode(65 + index); // A, B, C...

      precosData.forEach(({ item, precos }) => {
        const preco = precos.get(mercado.id);
        
        if (preco) {
          const precoTotal = preco * item.quantidade;
          
          // Verificar se é o melhor preço
          let melhorPreco = Infinity;
          precos.forEach(p => {
            if (p < melhorPreco) melhorPreco = p;
          });

          produtosMercado.push({
            id: item.id,
            produto_nome: item.produto_nome,
            quantidade: item.quantidade,
            unidade_medida: item.unidade_medida,
            preco_unitario: preco,
            preco_total: precoTotal,
            melhor_preco: preco === melhorPreco,
            economia: preco > melhorPreco ? (preco - melhorPreco) * item.quantidade : 0,
            comprado: item.comprado
          });
          
          totalMercado += precoTotal;
        }
      });

      totaisPorMercado.push(totalMercado);

      comparacao[`mercado${label}`] = {
        id: mercado.id,
        nome: mercado.nome,
        cnpj: mercado.cnpj,
        distancia: mercado.distancia,
        total: totalMercado,
        diferenca: totalMercado - totalOtimizado,
        produtos: produtosMercado
      };
    });

    // Calcular economia
    const maiorTotal = Math.max(...totaisPorMercado);
    const economia = maiorTotal - totalOtimizado;
    const percentualEconomia = maiorTotal > 0 ? (economia / maiorTotal) * 100 : 0;

    return new Response(
      JSON.stringify({
        otimizado: {
          total: totalOtimizado,
          economia,
          percentualEconomia,
          totalMercados: mercadosOtimizado.size,
          mercados: Array.from(mercadosOtimizado.values())
        },
        comparacao,
        produtosSemPreco
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}