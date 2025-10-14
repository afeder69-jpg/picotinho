import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngredienteComPreco {
  nome: string;
  quantidade: string;
  disponivel: boolean;
  quantidade_estoque: number;
  preco_unitario: number;
  custo_item: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Autorização necessária');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Usuário não autenticado');
    }

    const { receitaId } = await req.json();

    if (!receitaId) {
      throw new Error('receitaId é obrigatório');
    }

    console.log(`[calcular-custo-receita] Calculando custo para receita ${receitaId} do usuário ${user.id}`);

    // Buscar receita e número de porções
    const { data: receita, error: receitaError } = await supabase
      .from('receitas')
      .select('porcoes')
      .eq('id', receitaId)
      .single();

    if (receitaError || !receita) {
      throw new Error('Receita não encontrada');
    }

    // Buscar raio de busca do usuário
    const { data: config } = await supabase
      .from('configuracoes_usuario')
      .select('raio_busca_km')
      .eq('usuario_id', user.id)
      .single();

    const raioBusca = config?.raio_busca_km || 5.0;

    // Buscar localização do usuário (da última nota processada)
    const { data: ultimaNota } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos')
      .eq('usuario_id', user.id)
      .eq('processada', true)
      .not('dados_extraidos', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let userLat: number | null = null;
    let userLon: number | null = null;

    if (ultimaNota?.dados_extraidos) {
      const estabelecimento = ultimaNota.dados_extraidos.estabelecimento || 
                             ultimaNota.dados_extraidos.supermercado ||
                             ultimaNota.dados_extraidos.emitente;
      
      if (estabelecimento?.latitude && estabelecimento?.longitude) {
        userLat = parseFloat(estabelecimento.latitude);
        userLon = parseFloat(estabelecimento.longitude);
      }
    }

    // Buscar ingredientes da receita
    const { data: ingredientes, error: ingredientesError } = await supabase
      .from('receita_ingredientes')
      .select('produto_nome_busca, quantidade')
      .eq('receita_id', receitaId);

    if (ingredientesError) {
      throw new Error('Erro ao buscar ingredientes');
    }

    console.log(`[calcular-custo-receita] Encontrados ${ingredientes?.length || 0} ingredientes`);

    const ingredientesComPreco: IngredienteComPreco[] = [];
    let custoTotal = 0;

    for (const ingrediente of ingredientes || []) {
      const nomeBusca = ingrediente.produto_nome_busca.toUpperCase().trim();
      
      // Verificar disponibilidade no estoque
      const { data: estoque } = await supabase
        .from('estoque_app')
        .select('quantidade, preco_unitario_ultimo')
        .eq('user_id', user.id)
        .or(`produto_nome.ilike.%${nomeBusca}%,produto_nome_normalizado.ilike.%${nomeBusca}%`)
        .limit(1)
        .single();

      const disponivel = !!estoque && estoque.quantidade > 0;
      const quantidadeEstoque = estoque?.quantidade || 0;

      // Buscar preço mais recente
      let precoUnitario = 0;

      // 1. Tentar buscar de precos_atuais_usuario
      const { data: precoUsuario } = await supabase
        .from('precos_atuais_usuario')
        .select('valor_unitario')
        .eq('user_id', user.id)
        .or(`produto_nome.ilike.%${nomeBusca}%,produto_nome_normalizado.ilike.%${nomeBusca}%`)
        .order('data_atualizacao', { ascending: false })
        .limit(1)
        .single();

      if (precoUsuario?.valor_unitario) {
        precoUnitario = precoUsuario.valor_unitario;
        console.log(`[calcular-custo-receita] Preço do usuário encontrado: R$ ${precoUnitario}`);
      } else if (userLat && userLon) {
        // 2. Buscar de precos_atuais (estabelecimentos na área)
        const { data: precosArea } = await supabase
          .from('precos_atuais')
          .select('*')
          .or(`produto_nome.ilike.%${nomeBusca}%,produto_nome_normalizado.ilike.%${nomeBusca}%`);

        if (precosArea && precosArea.length > 0) {
          // Filtrar por distância usando a localização do estabelecimento
          for (const preco of precosArea) {
            // Buscar estabelecimento para pegar coordenadas
            const { data: notasEstabelecimento } = await supabase
              .from('notas_imagens')
              .select('dados_extraidos')
              .eq('usuario_id', user.id)
              .eq('processada', true)
              .not('dados_extraidos', 'is', null)
              .limit(100);

            for (const nota of notasEstabelecimento || []) {
              const estabelecimento = nota.dados_extraidos?.estabelecimento || 
                                     nota.dados_extraidos?.supermercado ||
                                     nota.dados_extraidos?.emitente;
              
              const cnpjNormalizado = (estabelecimento?.cnpj || '').replace(/[^\d]/g, '');
              const precoCnpj = (preco.estabelecimento_cnpj || '').replace(/[^\d]/g, '');

              if (cnpjNormalizado === precoCnpj && 
                  estabelecimento?.latitude && 
                  estabelecimento?.longitude) {
                
                const estabLat = parseFloat(estabelecimento.latitude);
                const estabLon = parseFloat(estabelecimento.longitude);
                
                const distancia = calcularDistancia(userLat, userLon, estabLat, estabLon);
                
                if (distancia <= raioBusca && preco.valor_unitario > 0) {
                  if (precoUnitario === 0 || preco.valor_unitario < precoUnitario) {
                    precoUnitario = preco.valor_unitario;
                  }
                }
              }
            }
          }
          
          if (precoUnitario > 0) {
            console.log(`[calcular-custo-receita] Preço da área encontrado: R$ ${precoUnitario}`);
          }
        }
      }

      // 3. Se ainda não tem preço, usar do estoque
      if (precoUnitario === 0 && estoque?.preco_unitario_ultimo) {
        precoUnitario = estoque.preco_unitario_ultimo;
        console.log(`[calcular-custo-receita] Preço do estoque: R$ ${precoUnitario}`);
      }

      const custoItem = precoUnitario;
      custoTotal += custoItem;

      ingredientesComPreco.push({
        nome: ingrediente.produto_nome_busca,
        quantidade: ingrediente.quantidade,
        disponivel,
        quantidade_estoque: quantidadeEstoque,
        preco_unitario: precoUnitario,
        custo_item: custoItem,
      });
    }

    const custoPorPorcao = receita.porcoes > 0 ? custoTotal / receita.porcoes : 0;
    const percentualDisponivel = ingredientes.length > 0 
      ? (ingredientesComPreco.filter(i => i.disponivel).length / ingredientes.length) * 100 
      : 0;

    console.log(`[calcular-custo-receita] Custo total: R$ ${custoTotal.toFixed(2)}, Por porção: R$ ${custoPorPorcao.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        custo_total: custoTotal,
        custo_por_porcao: custoPorPorcao,
        percentual_disponivel: percentualDisponivel,
        ingredientes: ingredientesComPreco,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[calcular-custo-receita] Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
