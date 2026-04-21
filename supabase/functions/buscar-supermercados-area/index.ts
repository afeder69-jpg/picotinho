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
      // Verificar múltiplas possibilidades de onde o CNPJ pode estar
      const cnpjNota = dadosExtraidos?.supermercado?.cnpj || 
                       dadosExtraidos?.cnpj || 
                       dadosExtraidos?.estabelecimento?.cnpj ||
                       dadosExtraidos?.emitente?.cnpj;
      
      if (cnpjNota) {
        // Normalizar CNPJ para comparação consistente (remover pontuação)
        const cnpjLimpo = cnpjNota.replace(/[^\d]/g, '');
        if (cnpjLimpo.length >= 14) {
          cnpjsComNotasAtivas.add(cnpjLimpo);
          notasPorCnpj.set(cnpjLimpo, (notasPorCnpj.get(cnpjLimpo) || 0) + 1);
          console.log(`🔍 CNPJ encontrado na nota: ${cnpjLimpo} (original: ${cnpjNota})`);
        } else {
          console.log(`⚠️ CNPJ inválido encontrado: ${cnpjLimpo} (length: ${cnpjLimpo.length})`);
        }
      } else {
        console.log(`❌ Nenhum CNPJ encontrado na nota ID: ${nota.id}`);
        console.log(`   Dados extraídos:`, JSON.stringify(dadosExtraidos, null, 2));
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

    // NOVA LÓGICA: Extrair estabelecimentos únicos das notas fiscais para garantir cobertura completa
    const estabelecimentosComNotasAtivas = new Map();
    
    notasAtivas?.forEach(nota => {
      const dadosExtraidos = nota.dados_extraidos;
      const cnpjNota = dadosExtraidos?.supermercado?.cnpj || 
                       dadosExtraidos?.cnpj || 
                       dadosExtraidos?.estabelecimento?.cnpj ||
                       dadosExtraidos?.emitente?.cnpj;
      
      if (cnpjNota) {
        const cnpjLimpo = cnpjNota.replace(/[^\d]/g, '');
        if (cnpjLimpo.length >= 14 && cnpjsComNotasAtivas.has(cnpjLimpo)) {
          // Capturar informações do estabelecimento das notas
          let nomeEstabelecimento = dadosExtraidos?.supermercado?.nome || 
                                   dadosExtraidos?.estabelecimento?.nome ||
                                   dadosExtraidos?.emitente?.nome ||
                                   'Estabelecimento';
          
          // Normalizar nome do estabelecimento
          nomeEstabelecimento = nomeEstabelecimento.toUpperCase();
          
          const enderecoEstabelecimento = dadosExtraidos?.supermercado?.endereco || 
                                          dadosExtraidos?.estabelecimento?.endereco ||
                                          dadosExtraidos?.emitente?.endereco ||
                                          '';

          if (!estabelecimentosComNotasAtivas.has(cnpjLimpo)) {
            estabelecimentosComNotasAtivas.set(cnpjLimpo, {
              cnpj: cnpjLimpo,
              nome: nomeEstabelecimento,
              endereco: enderecoEstabelecimento,
              quantidadeNotas: 0
            });
          }
          
          const estabelecimento = estabelecimentosComNotasAtivas.get(cnpjLimpo);
          estabelecimento.quantidadeNotas++;
        }
      }
    });

    // Buscar supermercados cadastrados com coordenadas válidas - USANDO VIEW SEGURA
    // IMPORTANTE: Não expor dados sensíveis (CNPJ, telefone, email) na resposta
    const { data: todosSupermercados, error: supermercadosError } = await supabase
      .from('supermercados_publicos')  // MUDANÇA: usando view segura
      .select('id, nome, cidade, estado, latitude_aproximada, longitude_aproximada, ativo, created_at, updated_at')
      .not('latitude_aproximada', 'is', null)
      .not('longitude_aproximada', 'is', null)
      .eq('ativo', true);

    if (supermercadosError) {
      console.error('Erro ao buscar supermercados:', supermercadosError);
      throw supermercadosError;
    }

    const supermercadosComNotasAtivas = [];
    
    // 1. Primeiro, adicionar supermercados já cadastrados que têm notas ativas
    // IMPORTANTE: Como não temos mais acesso ao CNPJ por segurança, vamos usar SERVICE ROLE para buscar internamente
    const { data: supermercadosCompletos } = await supabase
      .from('supermercados')
      .select('id, nome, cnpj, endereco, cidade, estado, cep, latitude, longitude, ativo, created_at, updated_at')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .eq('ativo', true);

    // Processar supermercados cadastrados
    if (supermercadosCompletos && supermercadosCompletos.length > 0) {
      for (let i = 0; i < supermercadosCompletos.length; i++) {
        const supermercado = supermercadosCompletos[i];
        const cnpjSupermercado = supermercado.cnpj?.replace(/[^\d]/g, '');
        
        if (cnpjSupermercado && cnpjsComNotasAtivas.has(cnpjSupermercado)) {
          const quantidadeNotas = notasPorCnpj.get(cnpjSupermercado) || 0;
          
          // Normalizar nome do estabelecimento
          let nomeNormalizado = supermercado.nome?.toUpperCase() || supermercado.nome;
          
          console.log(`✅ ${nomeNormalizado} - CNPJ: ${cnpjSupermercado} - ${quantidadeNotas} notas ativas (CADASTRADO)`);
          
          // Remover dados sensíveis (telefone/email) antes de adicionar à resposta
          const { telefone, email, ...supermercadoSeguro } = supermercado;
          supermercadosComNotasAtivas.push({
            ...supermercadoSeguro,
            nome: nomeNormalizado, // Usar nome normalizado
            latitude_aproximada: supermercado.latitude,
            longitude_aproximada: supermercado.longitude,
            fonte: 'cadastrado'
          });
          // Remover da lista de estabelecimentos das notas para evitar duplicatas
          estabelecimentosComNotasAtivas.delete(cnpjSupermercado);
        }
      }
    }

    // 2. Usar geocodificação para estabelecimentos não cadastrados, mas que têm notas ativas
    const estabelecimentosArray = Array.from(estabelecimentosComNotasAtivas.entries());
    for (let j = 0; j < estabelecimentosArray.length; j++) {
      const [cnpjLimpo, estabelecimento] = estabelecimentosArray[j];
      console.log(`🔍 Tentando geocodificar: ${estabelecimento.nome} - CNPJ: ${cnpjLimpo} - ${estabelecimento.quantidadeNotas} notas ativas (NÃO CADASTRADO)`);
      
      // Tentar geocodificar o endereço do estabelecimento
      try {
        const { data: geocodificacao, error: geoError } = await supabase.functions.invoke('geocodificar-endereco', {
          body: { endereco: estabelecimento.endereco }
        });

        // A função geocodificar-endereco retorna { success, coordenadas: { latitude, longitude } }
        const coords = geocodificacao?.coordenadas || geocodificacao;
        
        if (!geoError && geocodificacao?.success && coords?.latitude && coords?.longitude) {
          console.log(`📍 Geocodificação bem-sucedida para ${estabelecimento.nome}: ${coords.latitude}, ${coords.longitude}`);
          
          supermercadosComNotasAtivas.push({
            id: `temp_${cnpjLimpo}`,
            nome: estabelecimento.nome,
            cnpj: cnpjLimpo,
            endereco: estabelecimento.endereco,
            latitude: coords.latitude,
            longitude: coords.longitude,
            ativo: true,
            fonte: 'nota_fiscal',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        } else {
          console.log(`❌ Falha na geocodificação para ${estabelecimento.nome}: ${geoError?.message || geocodificacao?.message || 'Coordenadas não encontradas'}`);
        }
      } catch (error) {
        console.log(`❌ Erro ao geocodificar ${estabelecimento.nome}: ${error.message}`);
      }
    }

    console.log(`📍 Encontrados ${supermercadosComNotasAtivas.length} supermercados com notas fiscais ativas (antes da deduplicação)`);

    // Construir mapeamento ID→CNPJ ANTES da deduplicação (necessário para resolver CNPJs de supermercados cadastrados)
    const idParaCnpj = new Map();
    supermercadosCompletos?.forEach(s => {
      const cnpjLimpo = s.cnpj?.replace(/[^\d]/g, '');
      if (cnpjLimpo) {
        idParaCnpj.set(s.id, cnpjLimpo);
      }
    });

    // 🔄 DEDUPLICAÇÃO POR CNPJ — garantir no máximo 1 entrada por supermercado real
    const deduplicadosPorCnpj = new Map<string, any>();
    
    for (const supermercado of supermercadosComNotasAtivas) {
      // Extrair CNPJ normalizado de cada entrada
      let cnpjEntry = '';
      if (supermercado.fonte === 'cadastrado') {
        cnpjEntry = idParaCnpj.get(supermercado.id) || supermercado.cnpj?.replace(/[^\d]/g, '') || '';
      } else if (supermercado.fonte === 'nota_fiscal' && supermercado.id?.startsWith('temp_')) {
        cnpjEntry = supermercado.id.replace('temp_', '');
      } else {
        cnpjEntry = supermercado.cnpj?.replace(/[^\d]/g, '') || '';
      }
      
      if (!cnpjEntry) {
        // Sem CNPJ identificável — manter entrada (não pode deduplicar)
        deduplicadosPorCnpj.set(`unknown_${supermercado.id}`, supermercado);
        continue;
      }
      
      const existente = deduplicadosPorCnpj.get(cnpjEntry);
      if (!existente) {
        deduplicadosPorCnpj.set(cnpjEntry, supermercado);
      } else {
        // Priorizar: cadastrado > nota_fiscal; em empate, manter o com mais dados
        const fonteAtualMelhor = supermercado.fonte === 'cadastrado' && existente.fonte !== 'cadastrado';
        const mesmaFonteMaisDados = supermercado.fonte === existente.fonte && 
          (supermercado.endereco && !existente.endereco);
        
        if (fonteAtualMelhor || mesmaFonteMaisDados) {
          console.log(`🔄 CNPJ ${cnpjEntry}: substituindo "${existente.nome}" (${existente.fonte}) por "${supermercado.nome}" (${supermercado.fonte})`);
          deduplicadosPorCnpj.set(cnpjEntry, supermercado);
        } else {
          console.log(`🔄 CNPJ ${cnpjEntry}: mantendo "${existente.nome}" (${existente.fonte}), descartando "${supermercado.nome}" (${supermercado.fonte})`);
        }
      }
    }
    
    const supermercadosDeduplicados = Array.from(deduplicadosPorCnpj.values());
    console.log(`🔄 Deduplicação por CNPJ: ${supermercadosComNotasAtivas.length} → ${supermercadosDeduplicados.length} supermercados únicos`);

    // Filtrar supermercados dentro do raio especificado
    const supermercadosNoRaio = supermercadosDeduplicados.filter(supermercado => {
      const distancia = calcularDistancia(
        latitude,
        longitude,
        parseFloat(supermercado.latitude_aproximada || supermercado.latitude),
        parseFloat(supermercado.longitude_aproximada || supermercado.longitude)
      );
      
      console.log(`${supermercado.nome}: ${distancia.toFixed(3)}km`);
      return distancia <= raio;
    }).map(supermercado => ({
      ...supermercado,
      distancia: calcularDistancia(
        latitude,
        longitude,
        parseFloat(supermercado.latitude_aproximada || supermercado.latitude),
        parseFloat(supermercado.longitude_aproximada || supermercado.longitude)
      )
    })).sort((a, b) => a.distancia - b.distancia);

    console.log(`✅ Encontrados ${supermercadosNoRaio.length} supermercados dentro de ${raio}km`);

    // Contar produtos únicos de cada supermercado baseado nas notas fiscais reais
    // idParaCnpj já foi construído antes da deduplicação (reutilizado aqui)

    const supermercadosComDados = await Promise.all(
      supermercadosNoRaio.map(async (supermercado) => {
        // Buscar todas as notas processadas deste supermercado
        const { data: notasSupermercado } = await supabase
          .from('notas_imagens')
          .select('dados_extraidos')
          .eq('processada', true)
          .not('dados_extraidos', 'is', null);

        // Obter CNPJ do mapeamento interno (não expostos na resposta)
        let cnpjSupermercadoLimpo = '';
        if (supermercado.fonte === 'cadastrado') {
          cnpjSupermercadoLimpo = idParaCnpj.get(supermercado.id) || '';
        } else if (supermercado.fonte === 'nota_fiscal' && supermercado.id.startsWith('temp_')) {
          cnpjSupermercadoLimpo = supermercado.id.replace('temp_', '');
        }

        // Filtrar notas que pertencem a este supermercado (por CNPJ normalizado)
        const notasDoSupermercado = notasSupermercado?.filter(nota => {
          const dadosExtraidos = nota.dados_extraidos;
          // Verificar múltiplas possibilidades de onde o CNPJ pode estar
          const cnpjNota = dadosExtraidos?.supermercado?.cnpj || 
                           dadosExtraidos?.cnpj || 
                           dadosExtraidos?.estabelecimento?.cnpj ||
                           dadosExtraidos?.emitente?.cnpj;
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

        // Normalizar o nome do supermercado seguindo a hierarquia:
        // 1) normalizacoes_estabelecimentos (por CNPJ) → 2) RPC normalizar_nome_estabelecimento → 3) nome original
        const cnpjParaNorm = idParaCnpj.get(supermercado.id) || supermercado.cnpj || null;
        let nomeNormalizado = supermercado.nome;

        if (cnpjParaNorm) {
          try {
            const cnpjLimpoNorm = String(cnpjParaNorm).replace(/\D/g, '');
            const { data: normRow } = await supabase
              .from('normalizacoes_estabelecimentos')
              .select('nome_normalizado')
              .eq('ativo', true)
              .eq('cnpj_original', cnpjLimpoNorm)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (normRow?.nome_normalizado) {
              nomeNormalizado = normRow.nome_normalizado;
            }
          } catch (errNormCnpj) {
            console.log(`⚠️ Falha na normalização por CNPJ (${cnpjParaNorm}): ${errNormCnpj.message}`);
          }
        }

        // Fallback final: RPC do banco se ainda não houve normalização explícita
        if (nomeNormalizado === supermercado.nome) {
          try {
            const { data: nomeNormalizadoResult } = await supabase.rpc('normalizar_nome_estabelecimento', {
              nome_input: supermercado.nome,
              cnpj_input: cnpjParaNorm
            });
            if (nomeNormalizadoResult) {
              nomeNormalizado = nomeNormalizadoResult;
            }
          } catch (error) {
            console.log(`Erro ao normalizar nome do supermercado ${supermercado.nome}: ${error.message}`);
          }
        }

        return {
          ...supermercado,
          nome: nomeNormalizado,
          cnpj: cnpjParaNorm,
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