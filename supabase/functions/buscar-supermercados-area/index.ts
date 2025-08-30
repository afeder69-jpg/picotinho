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

    // Buscar todos os supermercados com coordenadas
    const { data: supermercados, error: supermercadosError } = await supabase
      .from('supermercados')
      .select('*')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .eq('ativo', true);

    if (supermercadosError) {
      console.error('Erro ao buscar supermercados:', supermercadosError);
      throw supermercadosError;
    }

    // Filtrar supermercados dentro do raio especificado
    const supermercadosNoRaio = supermercados?.filter(supermercado => {
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
    })).sort((a, b) => a.distancia - b.distancia) || [];

    console.log(`✅ Encontrados ${supermercadosNoRaio.length} supermercados dentro de ${raio}km`);

    // Buscar também quantos produtos cada supermercado tem em preços atuais
    const supermercadosComDados = await Promise.all(
      supermercadosNoRaio.map(async (supermercado) => {
        const { count } = await supabase
          .from('precos_atuais')
          .select('*', { count: 'exact', head: true })
          .eq('estabelecimento_cnpj', supermercado.cnpj);

        return {
          ...supermercado,
          produtos_disponiveis: count || 0
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