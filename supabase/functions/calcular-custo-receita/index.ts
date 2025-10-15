import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngredienteComPreco {
  nome: string;
  quantidade: string;
  unidade_medida: string;
  disponivel: boolean;
  quantidade_estoque: number;
  preco_unitario: number;
  custo_item: number;
  fonte_preco: string;
  sugestao?: string;
}

function normalizarParaBusca(texto: string): string {
  return texto
    .toUpperCase()
    .trim()
    // Remover palavras conectoras comuns
    .replace(/\s+(C\/|COM|NO|NA|DE|DA|DO|EM|PARA|POR)\s+/gi, ' ')
    .replace(/\s+(C\/|COM|NO|NA|DE|DA|DO|EM|PARA|POR)$/gi, '')
    .replace(/^(C\/|COM|NO|NA|DE|DA|DO|EM|PARA|POR)\s+/gi, '')
    // Remover "UNIDADE(S)" e variações
    .replace(/UNIDADES?/gi, '')
    // Normalizar números com barra: "C/30" → "30"
    .replace(/C\/(\d+)/gi, '$1')
    // Remover espaços múltiplos
    .replace(/\s+/g, ' ')
    .trim();
}

function calcularSimilaridade(texto1: string, texto2: string): number {
  const palavras1 = texto1.split(' ').filter(p => p.length > 2);
  const palavras2 = texto2.split(' ').filter(p => p.length > 2);
  
  if (palavras1.length === 0 || palavras2.length === 0) return 0;
  
  const matches = palavras1.filter(palavra => 
    palavras2.some(palavraItem => 
      palavraItem.includes(palavra) || palavra.includes(palavraItem)
    )
  );
  
  return matches.length / palavras1.length;
}

function detectarQuantidadeEmbalagem(nomeProduto: string, precoTotal: number) {
  const nomeUpper = nomeProduto.toUpperCase();
  
  if (!nomeUpper.includes('OVO') && !nomeUpper.includes('OVOS')) {
    return { isMultiUnit: false, quantity: 1, unitPrice: precoTotal };
  }
  
  const patterns = [
    /C\/(\d+)/,
    /(\d+)\s*UN(?:IDADE)?S?/i,
    /BANDEJAS?\s*C\/?\s*(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = nomeUpper.match(pattern);
    if (match) {
      const qty = parseInt(match[1]);
      if (qty >= 6 && qty <= 100) {
        return {
          isMultiUnit: true,
          quantity: qty,
          unitPrice: precoTotal / qty
        };
      }
    }
  }
  
  return { isMultiUnit: false, quantity: 1, unitPrice: precoTotal };
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
      const nomeBuscaNormalizado = normalizarParaBusca(nomeBusca);
      
      console.log(`[calcular-custo-receita] 🔍 Buscando: "${nomeBusca}"`);
      console.log(`[calcular-custo-receita] 📝 Normalizado: "${nomeBuscaNormalizado}"`);
      
      // Buscar TODOS os produtos do estoque do usuário para fazer fuzzy matching
      const { data: estoqueItems } = await supabase
        .from('estoque_app')
        .select('quantidade, preco_unitario_ultimo, produto_nome')
        .eq('user_id', user.id)
        .limit(100);
      
      // Filtrar manualmente por similaridade
      let estoqueMatch = null;
      let melhorSimilaridade = 0;
      
      for (const item of estoqueItems || []) {
        const nomeItemNormalizado = normalizarParaBusca(item.produto_nome);
        const similaridade = calcularSimilaridade(nomeBuscaNormalizado, nomeItemNormalizado);
        
        console.log(`[calcular-custo-receita] 🔎 "${nomeBuscaNormalizado}" vs "${nomeItemNormalizado}" → ${(similaridade * 100).toFixed(0)}%`);
        
        if (similaridade >= 0.6 && similaridade > melhorSimilaridade) {
          melhorSimilaridade = similaridade;
          estoqueMatch = item;
        }
      }
      
      const estoque = estoqueMatch;
      
      if (estoque) {
        console.log(`[calcular-custo-receita] ✅ MATCH! ${estoque.produto_nome} (${(melhorSimilaridade * 100).toFixed(0)}%)`);
      } else {
        console.log(`[calcular-custo-receita] ❌ Nenhum produto similar encontrado no estoque`);
      }

      const disponivel = !!estoque && estoque.quantidade > 0;
      const quantidadeEstoque = estoque?.quantidade || 0;

      // Buscar preço mais recente
      let precoUnitario = 0;

      // 1. Tentar buscar de precos_atuais_usuario com fuzzy matching
      const { data: precosUsuarioItems } = await supabase
        .from('precos_atuais_usuario')
        .select('valor_unitario, produto_nome')
        .eq('user_id', user.id)
        .limit(100);
      
      let precoUsuarioMatch = null;
      let melhorSimilaridadePreco = 0;
      
      for (const item of precosUsuarioItems || []) {
        const nomeItemNormalizado = normalizarParaBusca(item.produto_nome);
        const similaridade = calcularSimilaridade(nomeBuscaNormalizado, nomeItemNormalizado);
        
        if (similaridade >= 0.6 && similaridade > melhorSimilaridadePreco) {
          melhorSimilaridadePreco = similaridade;
          precoUsuarioMatch = item;
        }
      }
      
      console.log(`[calcular-custo-receita] 💰 Preço usuário: ${precoUsuarioMatch ? `R$ ${precoUsuarioMatch.valor_unitario} (${precoUsuarioMatch.produto_nome})` : 'NÃO ENCONTRADO'}`);

      if (precoUsuarioMatch?.valor_unitario) {
        const nomeProduto = precoUsuarioMatch.produto_nome || nomeBusca;
        const embalagem = detectarQuantidadeEmbalagem(nomeProduto, precoUsuarioMatch.valor_unitario);
        precoUnitario = embalagem.unitPrice;
        
        if (embalagem.isMultiUnit) {
          console.log(`[calcular-custo-receita] 🥚 OVO DETECTADO (usuário): ${nomeProduto} → ${embalagem.quantity}un @ R$ ${precoUnitario.toFixed(3)}`);
        } else {
          console.log(`[calcular-custo-receita] ✅ Preço do usuário: R$ ${precoUnitario}`);
        }
      } else if (userLat && userLon) {
        // 2. Buscar de precos_atuais (estabelecimentos na área)
        const { data: precosArea } = await supabase
          .from('precos_atuais')
          .select('*')
          .or(`produto_nome.ilike.%${nomeNormalizado}%,produto_nome_normalizado.ilike.%${nomeNormalizado}%`);
        
        console.log(`[calcular-custo-receita] 🏪 Preços na área: ${precosArea?.length || 0} estabelecimentos`);

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
                  const embalagem = detectarQuantidadeEmbalagem(preco.produto_nome, preco.valor_unitario);
                  const precoCalculado = embalagem.unitPrice;
                  
                  if (precoUnitario === 0 || precoCalculado < precoUnitario) {
                    precoUnitario = precoCalculado;
                    
                    if (embalagem.isMultiUnit) {
                      console.log(`[calcular-custo-receita] 🥚 OVO DETECTADO (área): ${preco.produto_nome} → ${embalagem.quantity}un @ R$ ${precoUnitario.toFixed(3)}`);
                    }
                  }
                }
              }
            }
          }
          
          if (precoUnitario > 0) {
            console.log(`[calcular-custo-receita] 🏪 Preço área usado: R$ ${precoUnitario.toFixed(3)}`);
          }
        }
      }
      
      // 4. Se AINDA não tem preço, buscar de precos_atuais (qualquer estabelecimento) com fuzzy matching
      if (precoUnitario === 0) {
        const { data: precosGeraisItems } = await supabase
          .from('precos_atuais')
          .select('valor_unitario, produto_nome')
          .limit(1000);
        
        let precoGeralMatch = null;
        let melhorSimilaridadeGeral = 0;
        
        for (const item of precosGeraisItems || []) {
          const nomeItemNormalizado = normalizarParaBusca(item.produto_nome);
          const similaridade = calcularSimilaridade(nomeBuscaNormalizado, nomeItemNormalizado);
          
          if (similaridade >= 0.6 && similaridade > melhorSimilaridadeGeral) {
            melhorSimilaridadeGeral = similaridade;
            precoGeralMatch = item;
          }
        }

        if (precoGeralMatch?.valor_unitario) {
          const embalagem = detectarQuantidadeEmbalagem(precoGeralMatch.produto_nome, precoGeralMatch.valor_unitario);
          precoUnitario = embalagem.unitPrice;
          console.log(`[calcular-custo-receita] 🌐 Preço geral encontrado: R$ ${precoUnitario.toFixed(3)} (${precoGeralMatch.produto_nome}, ${(melhorSimilaridadeGeral * 100).toFixed(0)}%)`);
        }
      }

      // 5. Se ainda não tem preço, usar do estoque
      if (precoUnitario === 0 && estoque?.preco_unitario_ultimo) {
        const nomeProdutoEstoque = estoque.produto_nome || nomeBusca;
        const embalagem = detectarQuantidadeEmbalagem(nomeProdutoEstoque, estoque.preco_unitario_ultimo);
        precoUnitario = embalagem.unitPrice;
        
        if (embalagem.isMultiUnit) {
          console.log(`[calcular-custo-receita] 🥚 OVO DETECTADO (estoque): ${nomeProdutoEstoque} → ${embalagem.quantity}un @ R$ ${precoUnitario.toFixed(3)}`);
        } else {
          console.log(`[calcular-custo-receita] 📊 Preço do estoque: R$ ${precoUnitario.toFixed(3)}`);
        }
      }

      // Parse da quantidade (ex: "2", "500g", "1kg") - converte para string se for número
      const quantidadeStr = String(ingrediente.quantidade || 1);
      const quantidadeNumerica = parseFloat(quantidadeStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 1;

      const custoItem = precoUnitario * quantidadeNumerica;
      custoTotal += custoItem;

      // Extrair unidade de medida da string quantidade
      const unidadeMatch = quantidadeStr.match(/[a-zA-Z]+/);
      const unidadeMedida = unidadeMatch ? unidadeMatch[0] : 'un';

      console.log(`[calcular-custo-receita] ${nomeBusca}: ${quantidadeNumerica}x R$ ${precoUnitario.toFixed(3)} = R$ ${custoItem.toFixed(2)} | Fonte: ${precoUnitario > 0 ? '✅' : '❌'}`);

      // Gerar sugestão se não encontrou preço
      let sugestao: string | undefined = undefined;
      if (precoUnitario === 0) {
        if (estoqueMatch) {
          sugestao = `Produto similar encontrado no estoque: ${estoqueMatch.produto_nome}`;
        } else {
          sugestao = 'Adicione este produto ao estoque ou cadastre um preço manual';
        }
      }

      ingredientesComPreco.push({
        nome: ingrediente.produto_nome_busca,
        quantidade: ingrediente.quantidade,
        unidade_medida: unidadeMedida,
        disponivel,
        quantidade_estoque: quantidadeEstoque,
        preco_unitario: precoUnitario,
        custo_item: custoItem,
        fonte_preco: precoUnitario > 0 ? 'encontrado' : 'nao_encontrado',
        sugestao,
      });
    }

    const custoPorPorcao = receita.porcoes > 0 ? custoTotal / receita.porcoes : 0;
    const percentualDisponivel = ingredientes.length > 0 
      ? (ingredientesComPreco.filter(i => i.disponivel).length / ingredientes.length) * 100 
      : 0;

    const totalComPreco = ingredientesComPreco.filter(i => i.preco_unitario > 0).length;
    const totalSemPreco = ingredientesComPreco.filter(i => i.preco_unitario === 0).length;

    console.log(`[calcular-custo-receita] ✅ Custo total: R$ ${custoTotal.toFixed(2)}, Por porção: R$ ${custoPorPorcao.toFixed(2)}`);
    console.log(`[calcular-custo-receita] 📊 Preços: ${totalComPreco} encontrados, ${totalSemPreco} não encontrados`);

    return new Response(
      JSON.stringify({
        custo_total: custoTotal,
        custo_por_porcao: custoPorPorcao,
        percentual_disponivel: percentualDisponivel,
        ingredientes: ingredientesComPreco,
        debug: {
          total_ingredientes: ingredientes.length,
          com_preco: totalComPreco,
          sem_preco: totalSemPreco,
        }
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
