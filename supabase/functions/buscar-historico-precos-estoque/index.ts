import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    if (!produtos || !Array.isArray(produtos) || !userId) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros inválidos. Necessário: produtos (array), userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Buscando histórico para ${produtos.length} produtos do usuário ${userId}`);

    const resultado = [];

    for (const produto of produtos) {
      const produtoNormalizado = produto.toLowerCase().trim();
      
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
          const nomeItem = (item.descricao || item.nome || '').toLowerCase().trim();
          
          if (nomeItem.includes(produtoNormalizado) || produtoNormalizado.includes(nomeItem)) {
            if (!ultimaCompraDoUsuario || new Date(dataCompra) > new Date(ultimaCompraDoUsuario.data)) {
              ultimaCompraDoUsuario = {
                data: dataCompra,
                preco: parseFloat(item.valor_unitario || 0),
                quantidade: parseFloat(item.quantidade || 0)
              };
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
              const nomeItem = (item.descricao || item.nome || '').toLowerCase().trim();
              
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
        produto,
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
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
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