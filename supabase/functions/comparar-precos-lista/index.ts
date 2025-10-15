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

    // Buscar configuração do usuário
    const { data: config } = await supabase
      .from('configuracoes_usuario')
      .select('raio_busca_km')
      .eq('usuario_id', userId)
      .single();

    const raioBusca = config?.raio_busca_km || 5;

    // Buscar localização do usuário (última nota)
    const { data: ultimaNota } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos')
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let mercados: any[] = [];

    // Se tiver localização, buscar mercados próximos
    if (ultimaNota?.dados_extraidos?.estabelecimento?.coordenadas) {
      const { latitude, longitude } = ultimaNota.dados_extraidos.estabelecimento.coordenadas;
      
      const { data: mercadosProximos } = await supabase
        .from('supermercados_publicos')
        .select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (mercadosProximos) {
        mercados = mercadosProximos
          .map(m => ({
            ...m,
            distancia: calcularDistancia(latitude, longitude, m.latitude, m.longitude)
          }))
          .filter(m => m.distancia <= raioBusca)
          .sort((a, b) => a.distancia - b.distancia)
          .slice(0, 3);
      }
    }

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

    // Buscar preços para cada produto em cada mercado
    const precosPromises = itens.map(async (item) => {
      const precosMap = new Map();

      for (const mercado of mercados) {
        // Tentar preço do usuário primeiro
        const { data: precoUsuario } = await supabase
          .from('precos_atuais_usuario')
          .select('valor_unitario')
          .eq('user_id', userId)
          .ilike('produto_nome', `%${item.produto_nome}%`)
          .order('data_atualizacao', { ascending: false })
          .limit(1)
          .single();

        if (precoUsuario) {
          precosMap.set(mercado.id, precoUsuario.valor_unitario);
          continue;
        }

        // Tentar preço geral
        const { data: precoGeral } = await supabase
          .from('precos_atuais')
          .select('valor_unitario')
          .eq('estabelecimento_cnpj', mercado.cnpj)
          .ilike('produto_nome', `%${item.produto_nome}%`)
          .order('data_atualizacao', { ascending: false })
          .limit(1)
          .single();

        if (precoGeral) {
          precosMap.set(mercado.id, precoGeral.valor_unitario);
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