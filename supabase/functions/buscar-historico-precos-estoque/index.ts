import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para normalizar nomes de produtos para matching robusto
function normalizarNomeProduto(nome: string): string {
  // 1. Lowercase e trim básico
  let normalizado = nome
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Espaços múltiplos → único
  
  // 2. Remover acentos (Unicode normalization)
  normalizado = normalizado
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  // 3. Remover palavras descritivas comuns
  const palavrasRemover = [
    'kg', 'granel', 'unidade', 'un', 'super', 'extra',
    'tradicional', 'classico', 'trad', 'trad.', 'gra.', 'gra',
    'quilograma', 'quilogramas'
  ];
  
  for (const palavra of palavrasRemover) {
    const regex = new RegExp(`\\b${palavra}\\b`, 'gi');
    normalizado = normalizado.replace(regex, '');
  }
  
  // 4. Normalizar abreviações comuns
  const abreviacoes: { [key: string]: string } = {
    's/lac': 'sem lactose',
    'c/lac': 'com lactose',
    's/lactose': 'sem lactose',
    'c/sal': 'com sal',
    's/sal': 'sem sal',
    'pct': 'pacote',
    'cx': 'caixa',
    'lt': 'litro',
    'ml': 'mililitro',
    'gr': 'grama',
    'pc': 'peca',
    'peca': 'peca'
  };
  
  // Substituir cada abreviação
  for (const [abrev, completo] of Object.entries(abreviacoes)) {
    // Usar regex para match de palavra completa
    const regex = new RegExp(`\\b${abrev}\\b`, 'gi');
    normalizado = normalizado.replace(regex, completo);
  }
  
  // 5. Remover pontuação exceto ponto entre números
  normalizado = normalizado.replace(/[^a-z0-9\s.]/g, ' ');
  
  // 6. Limpar espaços múltiplos novamente
  normalizado = normalizado.replace(/\s+/g, ' ').trim();
  
  return normalizado;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { produtos, userId, latitude, longitude, raioKm } = await req.json();

    if (!produtos || !Array.isArray(produtos) || produtos.length === 0 || !userId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Parâmetros inválidos. Necessário: produtos (array não-vazio), userId' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Buscando histórico para ${produtos.length} produtos do usuário ${userId}`);

    const resultado = [];

    for (const produtoData of produtos) {
      // Suportar tanto string quanto objeto
      const produtoNome = typeof produtoData === 'string' 
        ? produtoData 
        : produtoData.produto_nome;
      
      const produtoId = typeof produtoData === 'object' 
        ? produtoData.id 
        : null;

      const produtoMasterId = typeof produtoData === 'object'
        ? produtoData.produto_master_id
        : null;

      console.log(`📦 Processando: ${produtoNome} | ID: ${produtoId} | Master: ${produtoMasterId}`);

      // 🔍 BUSCAR PRODUTO NO ESTOQUE (BUSCA EXATA POR ID OU NOME)
      let produtoEstoque = null;
      
      // Buscar primeiro por ID (mais preciso)
      if (produtoId) {
        console.log(`🔍 Buscando por ID: ${produtoId}`);
        const { data } = await supabase
          .from('estoque_app')
          .select('produto_nome_normalizado, produto_master_id, produto_nome')
          .eq('user_id', userId)
          .eq('id', produtoId)
          .maybeSingle();
        produtoEstoque = data;
        if (produtoEstoque) {
          console.log(`✅ Encontrado por ID: ${produtoEstoque.produto_nome}`);
        }
      }

      // Fallback: buscar por nome exato
      if (!produtoEstoque && produtoNome) {
        console.log(`🔍 Fallback: Buscando por nome exato: ${produtoNome}`);
        const { data } = await supabase
          .from('estoque_app')
          .select('produto_nome_normalizado, produto_master_id, produto_nome')
          .eq('user_id', userId)
          .eq('produto_nome', produtoNome)
          .maybeSingle();
        produtoEstoque = data;
        if (produtoEstoque) {
          console.log(`✅ Encontrado por nome: ${produtoEstoque.produto_nome}`);
        }
      }

      if (!produtoEstoque) {
        console.log(`❌ Produto não encontrado: ${produtoNome}`);
        resultado.push({
          produto: produtoNome,
          ultimaCompraUsuario: null,
          menorPrecoArea: null,
          erro: 'Produto não encontrado no estoque'
        });
        continue;
      }

      if (!produtoEstoque.produto_master_id) {
        console.log(`⏳ Produto sem master_id: ${produtoNome}`);
        resultado.push({
          produto: produtoNome,
          ultimaCompraUsuario: null,
          menorPrecoArea: null,
          erro: 'Produto não normalizado'
        });
        continue;
      }

      // Usar produto_nome_normalizado do banco
      const produtoNormalizado = produtoEstoque.produto_nome_normalizado || normalizarNomeProduto(produtoNome);
      console.log(`✅ Normalizado: "${produtoNormalizado}" (master: ${produtoEstoque.produto_master_id})`);
      
      // 1. Buscar última compra do próprio usuário
      const { data: ultimaCompraUsuario, error: errorUsuario } = await supabase
        .from('notas_imagens')
        .select(`
          dados_extraidos,
          created_at
        `)
        .eq('usuario_id', userId)
        .eq('processada', true)
        .not('dados_extraidos', 'is', null)
        .order('created_at', { ascending: false });

      if (errorUsuario) {
        console.error('Erro ao buscar compras do usuário:', errorUsuario);
        continue;
      }

      let ultimaCompraDoUsuario = null;

      // Processar notas do usuário para encontrar o produto
      for (const nota of ultimaCompraUsuario || []) {
        const dados = nota.dados_extraidos as any;
        if (!dados?.itens) continue;

        // Buscar data da compra com validação robusta
        let dataCompra = null;
        const possiveisCampos = [
          dados.compra?.data_emissao,
          dados.compra?.data_compra,
          dados.dataCompra,
          dados.data_emissao,
          dados.data_compra
        ];

        for (const campo of possiveisCampos) {
          if (campo) {
            try {
              // Tentar diferentes formatos de data
              let dataTemp;
              if (typeof campo === 'string') {
                // Remover timezone se existir para evitar problemas
                const dataLimpa = campo.replace(/[-+]\d{2}:\d{2}$/, '');
                dataTemp = new Date(dataLimpa);
              } else {
                dataTemp = new Date(campo);
              }
              
              if (!isNaN(dataTemp.getTime()) && dataTemp.getFullYear() > 2020) {
                dataCompra = dataTemp.toISOString();
                break;
              }
            } catch (error) {
              continue;
            }
          }
        }

        if (!dataCompra) continue;

        for (const item of dados.itens) {
          const nomeItem = normalizarNomeProduto(item.descricao || item.nome || '');
          
          if (nomeItem.includes(produtoNormalizado) || produtoNormalizado.includes(nomeItem)) {
            if (!ultimaCompraDoUsuario || new Date(dataCompra) > new Date(ultimaCompraDoUsuario.data)) {
              const preco = parseFloat(item.valor_unitario || 0);
              const quantidade = parseFloat(item.quantidade || 0);
              
              // Só criar objeto se tiver dados válidos
              if (preco > 0 && quantidade > 0) {
                ultimaCompraDoUsuario = {
                  data: dataCompra,
                  preco: preco,
                  quantidade: quantidade
                };
              }
            }
            break;
          }
        }

        if (ultimaCompraDoUsuario) break;
      }

      // 2. Buscar menor preço na área de atuação (se coordenadas fornecidas)
      let menorPrecoArea = null;

      if (latitude && longitude && raioKm) {
        // Buscar todas as notas na área
        const { data: notasArea, error: errorArea } = await supabase
          .from('notas_imagens')
          .select(`
            dados_extraidos,
            created_at,
            usuario_id
          `)
          .eq('processada', true)
          .not('dados_extraidos', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500); // Limitar para performance

        if (!errorArea && notasArea) {
          const precosPorDia: { [data: string]: { preco: number; quantidade: number } } = {};

          for (const nota of notasArea) {
            const dados = nota.dados_extraidos as any;
            if (!dados?.itens) continue;

            // Verificar se o estabelecimento está na área (se tiver coordenadas)
            let dentroDoRaio = true;
            if (dados.estabelecimento?.latitude && dados.estabelecimento?.longitude) {
              const estabLat = parseFloat(dados.estabelecimento.latitude);
              const estabLon = parseFloat(dados.estabelecimento.longitude);
              
              const distancia = calcularDistancia(latitude, longitude, estabLat, estabLon);
              dentroDoRaio = distancia <= raioKm;
            }

            if (!dentroDoRaio) continue;

            // Buscar data da compra com validação robusta
            let dataCompra = null;
            const possiveisCampos = [
              dados.compra?.data_emissao,
              dados.compra?.data_compra,
              dados.dataCompra,
              dados.data_emissao,
              dados.data_compra
            ];

            for (const campo of possiveisCampos) {
              if (campo) {
                try {
                  // Tentar diferentes formatos de data
                  let dataTemp;
                  if (typeof campo === 'string') {
                    // Remover timezone se existir para evitar problemas
                    const dataLimpa = campo.replace(/[-+]\d{2}:\d{2}$/, '');
                    dataTemp = new Date(dataLimpa);
                  } else {
                    dataTemp = new Date(campo);
                  }
                  
                  if (!isNaN(dataTemp.getTime()) && dataTemp.getFullYear() > 2020) {
                    dataCompra = dataTemp.toISOString();
                    break;
                  }
                } catch (error) {
                  continue;
                }
              }
            }

            if (!dataCompra) continue;

            const dataFormatada = dataCompra.split('T')[0];

            for (const item of dados.itens) {
              const nomeItem = normalizarNomeProduto(item.descricao || item.nome || '');
              
              if (nomeItem.includes(produtoNormalizado) || produtoNormalizado.includes(nomeItem)) {
                const preco = parseFloat(item.valor_unitario || 0);
                const quantidade = parseFloat(item.quantidade || 0);
                
                if (preco > 0 && quantidade > 0) {
                  if (!precosPorDia[dataFormatada] || preco < precosPorDia[dataFormatada].preco) {
                    precosPorDia[dataFormatada] = { preco, quantidade };
                  }
                }
              }
            }
          }

          // Encontrar o dia mais recente com preço
          const diasComPreco = Object.keys(precosPorDia).sort().reverse();
          if (diasComPreco.length > 0) {
            const diaRecente = diasComPreco[0];
            menorPrecoArea = {
              data: diaRecente,
              preco: precosPorDia[diaRecente].preco,
              quantidade: precosPorDia[diaRecente].quantidade
            };
          }
        }
      } else {
        // Fallback: buscar na tabela precos_atuais
        const { data: precoGeral, error: errorGeral } = await supabase
          .from('precos_atuais')
          .select('*')
          .ilike('produto_nome', `%${produtoNormalizado}%`)
          .order('data_atualizacao', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!errorGeral && precoGeral) {
          menorPrecoArea = {
            data: precoGeral.data_atualizacao.split('T')[0],
            preco: precoGeral.valor_unitario,
            quantidade: 1
          };
        }
      }

      resultado.push({
        id: produtoId,
        produto: produtoNome,
        ultimaCompraUsuario,
        menorPrecoArea
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        resultados: resultado 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na função buscar-historico-precos-estoque:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Função para calcular distância entre duas coordenadas
function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}