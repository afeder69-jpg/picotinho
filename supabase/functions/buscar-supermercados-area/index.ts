import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { latitude, longitude, raio, userId } = await req.json();

    console.log('Buscando supermercados por localização:', { 
      latitude, 
      longitude, 
      raio: `${raio}km`,
      userId 
    });

    // Função para calcular distância entre dois pontos usando fórmula de Haversine
    function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371; // Raio da Terra em km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c; // Distância em km
    }

    // REGRA PRINCIPAL: Apenas supermercados com notas fiscais ativas podem aparecer
    // Buscar todas as notas fiscais processadas que ainda existem no sistema
    const { data: notasAtivas, error: notasError } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos, id')
      .eq('processada', true)
      .not('dados_extraidos', 'is', null);

    if (notasError) {
      console.error('Erro ao buscar notas ativas:', notasError);
      throw notasError;
    }

    console.log(`📄 Total de notas fiscais ativas no sistema: ${notasAtivas?.length || 0}`);

    // Verificação dinâmica: extrair CNPJs únicos apenas das notas que ainda existem
    const cnpjsComNotasAtivas = new Set<string>();
    const notasPorCnpj = new Map<string, number>();

    notasAtivas?.forEach(nota => {
      const dadosExtraidos = nota.dados_extraidos;
      const cnpjNota = dadosExtraidos?.supermercado?.cnpj || dadosExtraidos?.cnpj;
      
      if (cnpjNota) {
        // Normalizar CNPJ para comparação consistente
        const cnpjLimpo = cnpjNota.replace(/[^\d]/g, '');
        if (cnpjLimpo.length >= 14) {
          cnpjsComNotasAtivas.add(cnpjLimpo);
          notasPorCnpj.set(cnpjLimpo, (notasPorCnpj.get(cnpjLimpo) || 0) + 1);
        }
      }
    });

    console.log(`🏪 CNPJs únicos com notas ativas: ${cnpjsComNotasAtivas.size}`);
    
    // Log detalhado de quantas notas cada CNPJ possui
    notasPorCnpj.forEach((quantidade, cnpj) => {
      console.log(`  CNPJ ${cnpj}: ${quantidade} notas ativas`);
    });

    // Se não há notas ativas, retornar lista vazia
    if (cnpjsComNotasAtivas.size === 0) {
      console.log('⚠️ Nenhuma nota fiscal ativa encontrada - retornando lista vazia');
      return new Response(JSON.stringify({
        success: true,
        supermercados: [],
        totalEncontrados: 0,
        raioConsultado: raio,
        coordenadas: { latitude, longitude },
        motivo: 'Nenhum supermercado possui notas fiscais ativas'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar supermercados cadastrados com coordenadas válidas
    const { data: todosSupermercados, error: supermercadosError } = await supabase
      .from('supermercados')
      .select('*')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .eq('ativo', true);

    if (supermercadosError) {
      console.error('Erro ao buscar supermercados:', supermercadosError);
      throw supermercadosError;
    }

    // FILTRO CRÍTICO: Apenas supermercados que têm notas fiscais ativas
    const supermercadosComNotasAtivas = todosSupermercados?.filter(supermercado => {
      const cnpjSupermercado = supermercado.cnpj?.replace(/[^\d]/g, '');
      const temNotasAtivas = cnpjSupermercado && cnpjsComNotasAtivas.has(cnpjSupermercado);
      
      if (temNotasAtivas) {
        const quantidadeNotas = notasPorCnpj.get(cnpjSupermercado) || 0;
        console.log(`✅ ${supermercado.nome} - CNPJ: ${cnpjSupermercado} - ${quantidadeNotas} notas ativas`);
      }
      
      return temNotasAtivas;
    }) || [];

    console.log(`📍 Encontrados ${supermercadosComNotasAtivas.length} supermercados com notas fiscais ativas`);

    // Filtrar supermercados dentro do raio especificado
    const supermercadosNoRaio = supermercadosComNotasAtivas.filter(supermercado => {
      const distancia = calcularDistancia(
        latitude,
        longitude,
        parseFloat(supermercado.latitude),
        parseFloat(supermercado.longitude)
      );
      
      console.log(`${supermercado.nome}: ${distancia.toFixed(3)}km`);
      return distancia <= raio;
    }).map(supermercado => ({
      ...supermercado,
      distancia: calcularDistancia(
        latitude,
        longitude,
        parseFloat(supermercado.latitude),
        parseFloat(supermercado.longitude)
      )
    })).sort((a, b) => a.distancia - b.distancia);

    console.log(`✅ Encontrados ${supermercadosNoRaio.length} supermercados dentro de ${raio}km`);

    // Contar produtos únicos de cada supermercado baseado nas notas fiscais reais
    const supermercadosComDados = await Promise.all(
      supermercadosNoRaio.map(async (supermercado) => {
        // Buscar todas as notas processadas deste supermercado
        const { data: notasSupermercado } = await supabase
          .from('notas_imagens')
          .select('dados_extraidos')
          .eq('processada', true)
          .not('dados_extraidos', 'is', null);

        // Filtrar notas que pertencem a este supermercado (por CNPJ normalizado)
        const cnpjSupermercadoLimpo = supermercado.cnpj?.replace(/[^\d]/g, '');
        const notasDoSupermercado = notasSupermercado?.filter(nota => {
          const dadosExtraidos = nota.dados_extraidos;
          const cnpjNota = dadosExtraidos?.supermercado?.cnpj || dadosExtraidos?.cnpj;
          const cnpjNotaLimpo = cnpjNota?.replace(/[^\d]/g, '');
          return cnpjNotaLimpo === cnpjSupermercadoLimpo;
        }) || [];

        // Contar produtos únicos de todas as notas deste supermercado
        const produtosUnicos = new Set();
        
        notasDoSupermercado.forEach(nota => {
          const itens = nota.dados_extraidos?.itens || [];
          itens.forEach(item => {
            if (item.descricao && item.descricao.trim()) {
              // Normalizar nome do produto usando a mesma lógica do sistema
              let nomeNormalizado = item.descricao.trim().toUpperCase();
              
              // Remover variações comuns que podem gerar duplicatas
              nomeNormalizado = nomeNormalizado
                .replace(/\b(GRAENC|GRANEL)\b/g, 'GRANEL')
                .replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b/g, 'PAO DE FORMA')
                .replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|\d+G|\d+ML|\d+L)\b/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              
              if (nomeNormalizado.length > 2) {
                produtosUnicos.add(nomeNormalizado);
              }
            }
          });
        });

        console.log(`🛒 ${supermercado.nome}: ${produtosUnicos.size} produtos únicos de ${notasDoSupermercado.length} notas`);

        return {
          ...supermercado,
          produtos_disponiveis: produtosUnicos.size
        };
      })
    );

    return new Response(JSON.stringify({
      success: true,
      supermercados: supermercadosComDados,
      totalEncontrados: supermercadosComDados.length,
      raioConsultado: raio,
      coordenadas: { latitude, longitude }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro ao buscar supermercados por localização:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});