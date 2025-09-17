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
    let enderecoCompleto;
    
    // Se apenas 'endereco' foi fornecido (novo uso para estabelecimentos das notas)
    if (endereco && !supermercadoId && !cidade && !estado && !cep) {
      enderecoCompleto = `${endereco}, Brasil`;
    } else {
      // Priorizar CEP para geocodificação mais precisa
      if (cep) {
        // Se tem CEP, usar CEP + estado para maior precisão
        enderecoCompleto = `${cep}, ${estado || 'Brasil'}`;
        // Se também tem endereço e cidade, incluir no início para mais contexto
        if (endereco && cidade) {
          enderecoCompleto = `${endereco}, ${cidade}, ${cep}, ${estado || 'Brasil'}`;
        } else if (cidade) {
          enderecoCompleto = `${cidade}, ${cep}, ${estado || 'Brasil'}`;
        }
      } else {
        // Fallback para endereço sem CEP
        enderecoCompleto = `${endereco || ''}, ${cidade || ''}, ${estado || ''}, Brasil`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '');
      }
    }
    
    console.log('Endereço para geocodificação:', enderecoCompleto);

    // Função para geocodificação usando Nominatim (prioritário)
    async function geocodificarNominatim(endereco: string): Promise<{ latitude: number; longitude: number } | null> {
      try {
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
          throw new Error(`Erro na API Nominatim: ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data.length > 0) {
          const location = data[0];
          console.log('✅ Geocodificação Nominatim bem-sucedida');
          return {
            latitude: parseFloat(location.lat),
            longitude: parseFloat(location.lon)
          };
        }
        
        return null;
      } catch (error) {
        console.error('Erro na geocodificação Nominatim:', error);
        return null;
      }
    }

    // Função para geocodificação usando Mapbox (fallback)
    async function geocodificarMapbox(endereco: string): Promise<{ latitude: number; longitude: number } | null> {
      try {
        const mapboxToken = Deno.env.get('MAPBOX_ACCESS_TOKEN');
        if (!mapboxToken) {
          console.log('⚠️ Token do Mapbox não configurado, pulando fallback');
          return null;
        }

        const encodedAddress = encodeURIComponent(endereco);
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&country=BR&limit=1`
        );

        if (!response.ok) {
          throw new Error(`Erro na API Mapbox: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const location = data.features[0];
          console.log('✅ Geocodificação Mapbox (fallback) bem-sucedida');
          return {
            latitude: location.center[1], // Mapbox retorna [lng, lat]
            longitude: location.center[0]
          };
        }
        
        return null;
      } catch (error) {
        console.error('Erro na geocodificação Mapbox:', error);
        return null;
      }
    }

    // Função principal de geocodificação (Nominatim primeiro, Mapbox como fallback)
    async function geocodificarEndereco(endereco: string): Promise<{ latitude: number; longitude: number } | null> {
      // 1. Tentar primeiro com Nominatim (gratuito)
      console.log('🔍 Tentando geocodificação com Nominatim...');
      let coordenadas = await geocodificarNominatim(endereco);
      
      if (coordenadas) {
        return coordenadas;
      }
      
      // 2. Se falhar, tentar com Mapbox (fallback)
      console.log('🔄 Nominatim falhou, tentando fallback com Mapbox...');
      coordenadas = await geocodificarMapbox(endereco);
      
      if (coordenadas) {
        console.log('⚠️ Coordenadas obtidas via Mapbox (fallback econômico)');
        return coordenadas;
      }
      
      console.log('❌ Ambas as APIs falharam na geocodificação');
      return null;
    }

    // Geocodificar o endereço
    const coordenadas = await geocodificarEndereco(enderecoCompleto);
    
    if (coordenadas) {
      // Atualizar supermercado com coordenadas apenas se supermercadoId foi fornecido
      if (supermercadoId) {
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

        console.log(`✅ Coordenadas atualizadas no BD: ${coordenadas.latitude}, ${coordenadas.longitude}`);
      } else {
        console.log(`✅ Coordenadas obtidas (sem atualização no BD): ${coordenadas.latitude}, ${coordenadas.longitude}`);
      }

      return new Response(JSON.stringify({
        success: true,
        coordenadas,
        message: supermercadoId ? 'Endereço geocodificado e atualizado com sucesso' : 'Endereço geocodificado com sucesso'
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
        // Atualizar com coordenadas aproximadas apenas se supermercadoId foi fornecido
        if (supermercadoId) {
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

          console.log(`⚠️ Coordenadas aproximadas atualizadas no BD (cidade): ${coordenadasAproximadas.latitude}, ${coordenadasAproximadas.longitude}`);
        } else {
          console.log(`⚠️ Coordenadas aproximadas obtidas (sem atualização no BD): ${coordenadasAproximadas.latitude}, ${coordenadasAproximadas.longitude}`);
        }

        return new Response(JSON.stringify({
          success: true,
          coordenadas: coordenadasAproximadas,
          message: supermercadoId ? 'Endereço geocodificado aproximadamente e atualizado (por cidade)' : 'Endereço geocodificado aproximadamente (por cidade)',
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