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

    // Função para obter dados do CEP via ViaCEP
    async function obterDadosCEP(cep: string): Promise<{ logradouro: string; bairro: string; localidade: string; uf: string } | null> {
      try {
        const cepLimpo = cep.replace(/\D/g, '');
        const url = `https://viacep.com.br/ws/${cepLimpo}/json/`;
        
        console.log('🔍 Consultando ViaCEP:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Erro na ViaCEP: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📍 Resposta ViaCEP:', JSON.stringify(data, null, 2));
        
        if (data.erro) {
          console.log('❌ CEP não encontrado na ViaCEP');
          return null;
        }
        
        return {
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          localidade: data.localidade || '',
          uf: data.uf || ''
        };
      } catch (error) {
        console.error('Erro ao consultar ViaCEP:', error);
        return null;
      }
    }

    // Construir endereço completo para geocodificação
    let enderecoCompleto;
    let dadosCEP: any = null;
    
    // Se apenas 'endereco' foi fornecido (novo uso para estabelecimentos das notas)
    if (endereco && !supermercadoId && !cidade && !estado && !cep) {
      enderecoCompleto = `${endereco}, Brasil`;
    } else if (cep) {
      // Para CEPs, primeiro obter dados oficiais via ViaCEP
      dadosCEP = await obterDadosCEP(cep);
      
      if (dadosCEP) {
        // Construir endereço completo com dados oficiais do ViaCEP
        const partes = [
          dadosCEP.logradouro,
          dadosCEP.bairro,
          dadosCEP.localidade,
          dadosCEP.uf,
          'Brasil'
        ].filter(parte => parte && parte.trim() !== '');
        
        enderecoCompleto = partes.join(', ');
        console.log('✅ Endereço construído com ViaCEP:', enderecoCompleto);
      } else {
        // Fallback se ViaCEP falhar
        enderecoCompleto = `${cep}, Brasil`;
        console.log('⚠️ Usando fallback para CEP:', enderecoCompleto);
      }
    } else {
      // Fallback para endereço sem CEP
      enderecoCompleto = `${endereco || ''}, ${cidade || ''}, ${estado || ''}, Brasil`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '');
    }
    
    console.log('📍 Endereço final para geocodificação:', enderecoCompleto);

    // Função para geocodificação usando Google Maps API (prioritário para CEPs)
    async function geocodificarGoogleMaps(endereco: string): Promise<{ latitude: number; longitude: number } | null> {
      try {
        const googleMapsToken = Deno.env.get('GOOGLE_MAPS_API_KEY');
        if (!googleMapsToken) {
          console.log('⚠️ Token do Google Maps não configurado, pulando Google Maps');
          return null;
        }

        const encodedAddress = encodeURIComponent(endereco);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${googleMapsToken}`;
        
        console.log('🗺️ URL Google Maps:', url.replace(googleMapsToken, 'HIDDEN_KEY'));
        
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Erro na API Google Maps: ${response.status}`);
        }

        const data = await response.json();
        console.log('📍 Resposta Google Maps:', JSON.stringify(data, null, 2));
        
        if (data.results && data.results.length > 0) {
          const location = data.results[0];
          const coords = {
            latitude: location.geometry.location.lat,
            longitude: location.geometry.location.lng
          };
          
          console.log('✅ Geocodificação Google Maps bem-sucedida:', coords);
          console.log('🏷️ Formatted address:', location.formatted_address);
          
          // Verificar se as coordenadas são do Brasil
          if (coords.latitude >= -35 && coords.latitude <= 5 && coords.longitude >= -75 && coords.longitude <= -30) {
            return coords;
          } else {
            console.log('❌ Coordenadas fora do Brasil detectadas:', coords);
            return null;
          }
        }
        
        return null;
      } catch (error) {
        console.error('Erro na geocodificação Google Maps:', error);
        return null;
      }
    }

    // Função para geocodificação usando Nominatim (fallback)
    async function geocodificarNominatim(endereco: string): Promise<{ latitude: number; longitude: number } | null> {
      try {
        const encodedAddress = encodeURIComponent(endereco);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=br`;
        
        console.log('🌐 URL Nominatim:', url);
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Picotinho-App/1.0 (https://picotinho.app)'
          }
        });

        if (!response.ok) {
          throw new Error(`Erro na API Nominatim: ${response.status}`);
        }

        const data = await response.json();
        console.log('📍 Resposta Nominatim:', JSON.stringify(data, null, 2));
        
        if (data && data.length > 0) {
          const location = data[0];
          const coords = {
            latitude: parseFloat(location.lat),
            longitude: parseFloat(location.lon)
          };
          
          console.log('✅ Geocodificação Nominatim bem-sucedida:', coords);
          console.log('🏷️ Display name:', location.display_name);
          
          // Verificar se as coordenadas são do Brasil (aproximadamente)
          if (coords.latitude >= -35 && coords.latitude <= 5 && coords.longitude >= -75 && coords.longitude <= -30) {
            return coords;
          } else {
            console.log('❌ Coordenadas fora do Brasil detectadas:', coords);
            return null;
          }
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
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&country=BR&limit=1`;
        
        console.log('🗺️ URL Mapbox:', url);
        
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Erro na API Mapbox: ${response.status}`);
        }

        const data = await response.json();
        console.log('📍 Resposta Mapbox:', JSON.stringify(data, null, 2));
        
        if (data.features && data.features.length > 0) {
          const location = data.features[0];
          const coords = {
            latitude: location.center[1], // Mapbox retorna [lng, lat]
            longitude: location.center[0]
          };
          
          console.log('✅ Geocodificação Mapbox (fallback) bem-sucedida:', coords);
          console.log('🏷️ Place name:', location.place_name);
          
          // Verificar se as coordenadas são do Rio de Janeiro para CEPs 22xxx
          if (cep && cep.startsWith('227')) {
            // CEPs do Rio de Janeiro devem estar entre estas coordenadas aproximadas
            if (coords.latitude >= -23.1 && coords.latitude <= -22.8 && 
                coords.longitude >= -43.8 && coords.longitude <= -43.1) {
              return coords;
            } else {
              console.log('❌ Mapbox retornou coordenadas fora do RJ para CEP', cep, ':', coords);
              return null;
            }
          }
          
          // Verificar se as coordenadas são do Brasil
          if (coords.latitude >= -35 && coords.latitude <= 5 && coords.longitude >= -75 && coords.longitude <= -30) {
            return coords;
          } else {
            console.log('❌ Coordenadas fora do Brasil detectadas:', coords);
            return null;
          }
        }
        
        return null;
      } catch (error) {
        console.error('Erro na geocodificação Mapbox:', error);
        return null;
      }
    }

    // Função principal de geocodificação (Google Maps primeiro, depois fallbacks)
    async function geocodificarEndereco(endereco: string): Promise<{ latitude: number; longitude: number } | null> {
      // 1. Para CEPs com dados do ViaCEP, tentar primeiro com Google Maps (mais preciso)
      if (cep && dadosCEP) {
        console.log('🔍 Tentando geocodificação com Google Maps (CEP + ViaCEP)...');
        let coordenadas = await geocodificarGoogleMaps(endereco);
        
        if (coordenadas) {
          console.log('✅ Coordenadas obtidas via Google Maps (mais preciso)');
          return coordenadas;
        }
      }
      
      // 2. Fallback com Nominatim
      console.log('🔄 Tentando fallback com Nominatim...');
      let coordenadas = await geocodificarNominatim(endereco);
      
      if (coordenadas) {
        console.log('⚠️ Coordenadas obtidas via Nominatim (fallback)');
        return coordenadas;
      }
      
      // 3. Último fallback com Mapbox
      console.log('🔄 Nominatim falhou, tentando fallback com Mapbox...');
      coordenadas = await geocodificarMapbox(endereco);
      
      if (coordenadas) {
        console.log('⚠️ Coordenadas obtidas via Mapbox (último fallback)');
        return coordenadas;
      }
      
      console.log('❌ Todas as APIs falharam na geocodificação');
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