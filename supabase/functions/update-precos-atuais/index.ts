import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      compraId, 
      produtoNome, 
      precoUnitario, 
      estabelecimentoCnpj, 
      estabelecimentoNome, 
      dataCompra, 
      horaCompra,
      userId 
    } = await req.json();

    // ✅ Normalizar CNPJ imediatamente (remover formatação)
    const cnpjNormalizado = estabelecimentoCnpj ? estabelecimentoCnpj.replace(/\D/g, '') : '';

    console.log('Atualizando preços atuais:', { 
      compraId, 
      produtoNome, 
      precoUnitario, 
      estabelecimentoCnpj,
      cnpjNormalizado,
      dataCompra,
      userId 
    });

    // 1. Verificar configurações de área de atuação do usuário
    const { data: configuracaoUsuario } = await supabase
      .from('configuracoes_usuario')
      .select('raio_busca_km')
      .eq('usuario_id', userId)
      .single();

    const raioBusca = configuracaoUsuario?.raio_busca_km || 5.0; // 5km default
    console.log(`Raio de busca do usuário: ${raioBusca}km`);

    // ✅ VERIFICAÇÃO DE ÁREA - Conforme Manual de Operações
    // Buscar coordenadas do usuário e estabelecimento para verificar se está na área
    const { data: perfilUsuario } = await supabase
      .from('profiles')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .single();

    if (perfilUsuario?.latitude && perfilUsuario?.longitude && cnpjNormalizado) {
      // Buscar estabelecimento por CNPJ
      const { data: estabelecimentos } = await supabase
        .from('supermercados')
        .select('latitude, longitude, nome')
        .eq('cnpj', cnpjNormalizado);

      if (estabelecimentos && estabelecimentos.length > 0) {
        const estabelecimento = estabelecimentos[0];
        
        if (estabelecimento.latitude && estabelecimento.longitude) {
          // Calcular distância usando fórmula de Haversine
          const lat1 = perfilUsuario.latitude;
          const lon1 = perfilUsuario.longitude;
          const lat2 = estabelecimento.latitude;
          const lon2 = estabelecimento.longitude;
          
          const R = 6371; // Raio da Terra em km
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distancia = R * c;
          
          console.log(`📍 Distância calculada: ${distancia.toFixed(2)}km (limite: ${raioBusca}km)`);
          
          // ✅ Se estabelecimento está FORA da área, não atualizar precos_atuais (mas registra a compra)
          if (distancia > raioBusca) {
            console.log('⚠️ Estabelecimento FORA da área do usuário - Preço registrado mas não vira "Preço Atual"');
            return new Response(JSON.stringify({ 
              success: true, 
              message: 'Preço Pago registrado (estabelecimento fora da área)',
              fora_area: true,
              distancia: distancia.toFixed(2),
              compraId
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          console.log('✅ Estabelecimento DENTRO da área - pode atualizar Preço Atual');
        }
      }
    }

    // 2. Verificar se já existe um preço atual para este produto neste estabelecimento
    const { data: precoExistente } = await supabase
      .from('precos_atuais')
      .select('*')
      .eq('produto_nome', produtoNome)
      .eq('estabelecimento_cnpj', cnpjNormalizado)
      .single();

    console.log('Preço existente:', precoExistente);

    // 3. Determinar se deve atualizar baseado na data/hora
    let deveAtualizar = true;
    let dataNovaCompra;
    
    // Parsing da data da nota fiscal fora do if para estar sempre disponível
    try {
      // Se dataCompra já vem em formato ISO, usar direto
      if (dataCompra.includes('T')) {
        dataNovaCompra = new Date(dataCompra);
      } else if (dataCompra.includes('-')) {
        // Se vem em formato YYYY-MM-DD
        const horaFormatada = horaCompra || '00:00:00';
        dataNovaCompra = new Date(`${dataCompra}T${horaFormatada}`);
      } else {
        // Se vem em formato DD/MM/YYYY, converter
        const [dia, mes, ano] = dataCompra.split('/');
        const horaFormatada = horaCompra || '00:00:00';
        dataNovaCompra = new Date(`${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horaFormatada}`);
      }
    } catch (error) {
      console.error('Erro ao parsear data da nota fiscal:', { dataCompra, horaCompra, error });
      dataNovaCompra = new Date(); // Fallback para data atual
    }
    
    if (precoExistente) {
      const dataExistente = new Date(precoExistente.data_atualizacao);
      const precoExistenteValor = parseFloat(precoExistente.valor_unitario);
      const precoNovoValor = parseFloat(precoUnitario);
      
      console.log('Comparando preços e datas:', {
        existente: { 
          data: dataExistente.toISOString(), 
          preco: precoExistenteValor 
        },
        nova: { 
          data: dataNovaCompra.toISOString(), 
          preco: precoNovoValor 
        }
      });
      
      // ✅ REGRA DO MANUAL: Mais recente + menor valor
      if (dataNovaCompra > dataExistente) {
        // Nova compra é mais recente - verificar se também é mais barata
        if (precoNovoValor < precoExistenteValor) {
          console.log(`✅ Nova compra é MAIS RECENTE e MAIS BARATA - atualizando (${precoNovoValor} < ${precoExistenteValor})`);
          deveAtualizar = true;
        } else {
          console.log(`⚠️ Nova compra é mais recente MAS MAIS CARA - mantendo preço anterior (${precoExistenteValor} < ${precoNovoValor})`);
          deveAtualizar = false;
        }
      } else {
        deveAtualizar = false;
        console.log('❌ Nova compra não é mais recente, mantendo preço existente');
      }
    } else {
      console.log('✅ Primeiro preço para este produto/estabelecimento - inserindo');
    }

    if (deveAtualizar) {
      // 4. Atualizar/inserir preço atual (com normalização e user_id)
      const produtoNomeNormalizado = normalizarNomeProduto(produtoNome);
      
      // Resolve produto_master_id via estoque_app or candidatos
      let produtoMasterId: string | null = null;
      
      // Try via estoque_app first (most reliable)
      const { data: estoqueMatch } = await supabase
        .from('estoque_app')
        .select('produto_master_id')
        .eq('user_id', userId)
        .ilike('produto_nome', produtoNomeNormalizado)
        .not('produto_master_id', 'is', null)
        .limit(1)
        .maybeSingle();
      
      if (estoqueMatch?.produto_master_id) {
        produtoMasterId = estoqueMatch.produto_master_id;
      } else {
        // Fallback 2: busca direta no catálogo master por nome_padrao (match exato)
        const { data: masterMatch, count: masterCount } = await supabase
          .from('produtos_master_global')
          .select('id', { count: 'exact' })
          .eq('nome_padrao', produtoNomeNormalizado)
          .limit(2);
        
        if (masterCount === 1 && masterMatch?.[0]?.id) {
          produtoMasterId = masterMatch[0].id;
        } else {
          // Fallback 3: via candidatos normalizacao aprovados
          const { data: candidatoMatch } = await supabase
            .from('produtos_candidatos_normalizacao')
            .select('sugestao_produto_master')
            .ilike('texto_original', produtoNomeNormalizado)
            .not('sugestao_produto_master', 'is', null)
            .in('status', ['auto_aprovado', 'aprovado'])
            .limit(1)
            .maybeSingle();
          
          if (candidatoMatch?.sugestao_produto_master) {
            produtoMasterId = candidatoMatch.sugestao_produto_master;
          }
        }
      }
      
      console.log(`🔗 produto_master_id resolvido: ${produtoMasterId || 'null'} para "${produtoNomeNormalizado}"`);
      
      const upsertData: any = {
        produto_nome: produtoNomeNormalizado,
        estabelecimento_cnpj: cnpjNormalizado,
        estabelecimento_nome: estabelecimentoNome,
        valor_unitario: precoUnitario,
        data_atualizacao: dataNovaCompra.toISOString(),
        user_id: userId
      };
      
      if (produtoMasterId) {
        upsertData.produto_master_id = produtoMasterId;
      }
      
      const { data: precoAtualizado, error: erroUpdate } = await supabase
        .from('precos_atuais')
        .upsert(upsertData, {
          onConflict: 'produto_nome,estabelecimento_cnpj'
        })
        .select();

      if (erroUpdate) {
        console.error('Erro ao atualizar preço atual:', erroUpdate);
        throw erroUpdate;
      }

      console.log('✅ Preço atual atualizado:', precoAtualizado);

      // ✅ CONFORME MANUAL DE OPERAÇÕES: Preço Atual é calculado dinamicamente por área
      // Cada usuário terá seu "Preço Atual" baseado nos precos_atuais filtrados por SUA área
      // Não aplicamos preços globalmente - cada usuário consulta sua área individualmente
      console.log('✅ Preço atualizado em precos_atuais - será exibido dinamicamente por área');

      return new Response(JSON.stringify({
        success: true,
        message: 'Preço atual atualizado com sucesso',
        precoAtualizado: precoAtualizado?.[0],
        compraId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({
        success: true,
        message: 'Preço atual mantido (compra não é mais recente)',
        compraId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Erro ao atualizar preços atuais:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Função para normalizar nomes de produtos (evitar duplicatas semânticas)
function normalizarNomeProduto(nome: string): string {
  return nome
    .toUpperCase()
    .trim()
    // Remover acentos
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Padronizar espaços múltiplos
    .replace(/\s+/g, ' ')
    // Remover pontuação no final
    .replace(/[.,;!?]+$/, '')
    .trim();
}

// Função auxiliar para verificar similaridade entre produtos
function verificarSimilaridadeProduto(nome1: string, nome2: string): boolean {
  // Normalizar nomes para comparação - usar a mesma lógica da IA-2
  const normalizar = (nome: string) => nome
    .toUpperCase()
    .trim()
    // Remover acentos
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Remover unidades de medida e quantidades
    .replace(/\b(\d+(?:\.\d+)?\s*(KG|G|ML|L|UN|UNIDADE|LATA|PACOTE|CAIXA|FRASCO|BANDEJA))\b/g, '')
    .replace(/\b(KG|G|ML|L|UN|UNIDADE|LATA|PACOTE|CAIXA|FRASCO|BANDEJA)\b/g, '')
    // Remover números soltos
    .replace(/\b\d+(?:\.\d+)?\b/g, '')
    // Normalizar espaços
    .replace(/\s+/g, ' ')
    .trim();

  const nome1Norm = normalizar(nome1);
  const nome2Norm = normalizar(nome2);
  
  console.log(`🔍 Comparando similaridade: "${nome1}" (${nome1Norm}) vs "${nome2}" (${nome2Norm})`);
  
  // Verificar se são iguais após normalização
  if (nome1Norm === nome2Norm) {
    console.log('✅ Match exato');
    return true;
  }
  
  // Verificar se um contém o outro (mínimo 3 caracteres)
  if (nome1Norm.length >= 3 && nome2Norm.length >= 3) {
    if (nome1Norm.includes(nome2Norm) || nome2Norm.includes(nome1Norm)) {
      console.log('✅ Match por contenção');
      return true;
    }
  }
  
  // Verificar palavras-chave em comum
  const palavras1 = nome1Norm.split(' ').filter(p => p.length > 2);
  const palavras2 = nome2Norm.split(' ').filter(p => p.length > 2);
  
  if (palavras1.length === 0 || palavras2.length === 0) {
    console.log('❌ Sem palavras suficientes para comparar');
    return false;
  }
  
  let palavrasComuns = 0;
  palavras1.forEach(palavra => {
    if (palavras2.some(p => p.includes(palavra) || palavra.includes(p))) {
      palavrasComuns++;
    }
  });
  
  // Se pelo menos 60% das palavras coincidem, considera similar
  const percentualSimilaridade = palavrasComuns / Math.max(palavras1.length, palavras2.length);
  console.log(`📊 Similaridade: ${palavrasComuns}/${Math.max(palavras1.length, palavras2.length)} = ${(percentualSimilaridade * 100).toFixed(1)}%`);
  
  const isSimilar = percentualSimilaridade >= 0.6;
  console.log(isSimilar ? '✅ Match por similaridade' : '❌ Não similar o suficiente');
  
  return isSimilar;
}