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

    const { supermercadoId, endereco, cidade, estado, cep } = await req.json();

    console.log('Geocodificando endereço:', { supermercadoId, endereco, cidade, estado, cep });

    // Construir endereço completo para geocodificação
    const enderecoCompleto = `${endereco || ''}, ${cidade || ''}, ${estado || ''}, ${cep || ''}, Brasil`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '');
    
    console.log('Endereço para geocodificação:', enderecoCompleto);

    // Função para geocodificação usando API gratuita de geocodificação
    async function geocodificarEndereco(endereco: string): Promise<{ latitude: number; longitude: number } | null> {
      try {
        // Usar API do OpenStreetMap Nominatim (gratuita)
        const encodedAddress = encodeURIComponent(endereco);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=br`,
          {
            headers: {
              'User-Agent': 'Picotinho-App/1.0 (https://picotinho.app)'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Erro na API de geocodificação: ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data.length > 0) {
          const location = data[0];
          return {
            latitude: parseFloat(location.lat),
            longitude: parseFloat(location.lon)
          };
        }
        
        return null;
      } catch (error) {
        console.error('Erro na geocodificação:', error);
        return null;
      }
    }

    // Geocodificar o endereço
    const coordenadas = await geocodificarEndereco(enderecoCompleto);
    
    if (coordenadas) {
      // Atualizar supermercado com coordenadas
      const { error: updateError } = await supabase
        .from('supermercados')
        .update({
          latitude: coordenadas.latitude,
          longitude: coordenadas.longitude,
          updated_at: new Date().toISOString()
        })
        .eq('id', supermercadoId);

      if (updateError) {
        console.error('Erro ao atualizar coordenadas:', updateError);
        throw updateError;
      }

      console.log(`✅ Coordenadas atualizadas: ${coordenadas.latitude}, ${coordenadas.longitude}`);

      return new Response(JSON.stringify({
        success: true,
        coordenadas,
        message: 'Endereço geocodificado com sucesso'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Tentar coordenadas aproximadas por cidade/estado
      let coordenadasAproximadas = null;
      
      if (cidade && estado) {
        const cidadeEstado = `${cidade}, ${estado}, Brasil`;
        coordenadasAproximadas = await geocodificarEndereco(cidadeEstado);
      }

      if (coordenadasAproximadas) {
        // Atualizar com coordenadas aproximadas
        const { error: updateError } = await supabase
          .from('supermercados')
          .update({
            latitude: coordenadasAproximadas.latitude,
            longitude: coordenadasAproximadas.longitude,
            updated_at: new Date().toISOString()
          })
          .eq('id', supermercadoId);

        if (updateError) {
          console.error('Erro ao atualizar coordenadas aproximadas:', updateError);
          throw updateError;
        }

        console.log(`⚠️ Coordenadas aproximadas (cidade): ${coordenadasAproximadas.latitude}, ${coordenadasAproximadas.longitude}`);

        return new Response(JSON.stringify({
          success: true,
          coordenadas: coordenadasAproximadas,
          message: 'Endereço geocodificado aproximadamente (por cidade)',
          aproximado: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('❌ Não foi possível geocodificar o endereço');

      return new Response(JSON.stringify({
        success: false,
        message: 'Não foi possível encontrar coordenadas para este endereço',
        enderecoCompleto
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Erro na geocodificação:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});