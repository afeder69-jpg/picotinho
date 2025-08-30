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

    // Primeiro, buscar supermercados que tenham notas fiscais processadas
    const { data: supermercadosComNotas, error: notasError } = await supabase
      .from('notas_imagens')
      .select(`
        dados_extraidos,
        supermercados!inner(*)
      `)
      .eq('processada', true)
      .not('dados_extraidos', 'is', null)
      .not('supermercados.latitude', 'is', null)
      .not('supermercados.longitude', 'is', null)
      .eq('supermercados.ativo', true);

    if (notasError) {
      console.error('Erro ao buscar supermercados com notas:', notasError);
      throw notasError;
    }

    // Extrair supermercados únicos
    const supermercadosUnicos = new Map();
    supermercadosComNotas?.forEach(nota => {
      const supermercado = nota.supermercados;
      if (supermercado && !supermercadosUnicos.has(supermercado.id)) {
        supermercadosUnicos.set(supermercado.id, supermercado);
      }
    });

    const supermercados = Array.from(supermercadosUnicos.values());

    console.log(`📍 Encontrados ${supermercados.length} supermercados com notas fiscais`);

    // Filtrar supermercados dentro do raio especificado
    const supermercadosNoRaio = supermercados.filter(supermercado => {
      const distancia = calcularDistancia(
        latitude,
        longitude,
        parseFloat(supermercado.latitude),
        parseFloat(supermercado.longitude)
      );
      
      console.log(`${supermercado.nome}: ${distancia.toFixed(2)}km`);
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

        // Filtrar notas que pertencem a este supermercado (por CNPJ)
        const notasDoSupermercado = notasSupermercado?.filter(nota => {
          const dadosExtraidos = nota.dados_extraidos;
          const cnpjNota = dadosExtraidos?.supermercado?.cnpj || dadosExtraidos?.cnpj;
          return cnpjNota === supermercado.cnpj;
        }) || [];

        // Contar produtos únicos de todas as notas deste supermercado
        const produtosUnicos = new Set();
        
        notasDoSupermercado.forEach(nota => {
          const itens = nota.dados_extraidos?.itens || [];
          itens.forEach(item => {
            if (item.descricao) {
              // Normalizar nome do produto para evitar duplicatas
              const nomeNormalizado = item.descricao.trim().toUpperCase();
              produtosUnicos.add(nomeNormalizado);
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