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

    console.log('Atualizando preços atuais:', { 
      compraId, 
      produtoNome, 
      precoUnitario, 
      estabelecimentoCnpj, 
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

    // 2. Verificar se já existe um preço atual para este produto neste estabelecimento
    const { data: precoExistente } = await supabase
      .from('precos_atuais')
      .select('*')
      .eq('produto_nome', produtoNome)
      .eq('estabelecimento_cnpj', estabelecimentoCnpj)
      .single();

    console.log('Preço existente:', precoExistente);

    // 3. Determinar se deve atualizar baseado na data/hora e preço
    let deveAtualizar = true;
    
    if (precoExistente) {
      const dataExistente = new Date(precoExistente.data_atualizacao);
      
      // ✅ CORREÇÃO: Melhor parsing da data da nota fiscal (não data de lançamento)
      let dataNovaCompra;
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
      
      // NOVA REGRA: Atualiza se:
      // 1. A nova compra for mais recente E o preço for menor, OU
      // 2. Se não existir preço anterior válido
      if (dataNovaCompra > dataExistente && precoNovoValor < precoExistenteValor) {
        console.log('✅ Nova compra é mais recente E preço é menor - atualizando');
        deveAtualizar = true;
      } else if (dataNovaCompra <= dataExistente) {
        deveAtualizar = false;
        console.log('❌ Nova compra não é mais recente, mantendo preço existente');
      } else if (dataNovaCompra > dataExistente && precoNovoValor >= precoExistenteValor) {
        deveAtualizar = false;
        console.log('❌ Nova compra é mais recente mas preço não é menor, mantendo preço existente');
      }
    }

    if (deveAtualizar) {
      // 4. Atualizar/inserir preço atual
      const { data: precoAtualizado, error: erroUpdate } = await supabase
        .from('precos_atuais')
        .upsert({
          produto_nome: produtoNome,
          estabelecimento_cnpj: estabelecimentoCnpj,
          estabelecimento_nome: estabelecimentoNome,
          valor_unitario: precoUnitario,
          data_atualizacao: dataNovaCompra.toISOString() // ✅ Data real da nota fiscal
        }, {
          onConflict: 'produto_nome,estabelecimento_cnpj'
        })
        .select();

      if (erroUpdate) {
        console.error('Erro ao atualizar preço atual:', erroUpdate);
        throw erroUpdate;
      }

      console.log('✅ Preço atual atualizado:', precoAtualizado);

      // 5. Aplicar preço atual para usuários na área de atuação
      // Buscar todos os usuários que têm este produto no estoque
      const { data: usuariosComProduto } = await supabase
        .from('estoque_app')
        .select(`
          user_id,
          produto_nome,
          id,
          preco_unitario_ultimo
        `)
        .ilike('produto_nome', `%${produtoNome}%`);

      console.log(`Encontrados ${usuariosComProduto?.length || 0} usuários com produto similar`);

      if (usuariosComProduto) {
        let usuariosAtualizados = 0;
        
        for (const itemEstoque of usuariosComProduto) {
          // Verificar se o produto é similar (usando lógica de normalização)
          const produtoSimilar = verificarSimilaridadeProduto(itemEstoque.produto_nome, produtoNome);
          
          if (produtoSimilar && itemEstoque.preco_unitario_ultimo === null || itemEstoque.preco_unitario_ultimo === 0) {
            // CORREÇÃO CRÍTICA: Aplicar preço atual se não existe ou está zerado
            const { error: updateError } = await supabase
              .from('estoque_app')
              .update({
                preco_unitario_ultimo: precoUnitario
              })
              .eq('id', itemEstoque.id);
            
            if (!updateError) {
              console.log(`📍 Preço atual aplicado: ${itemEstoque.produto_nome} = R$ ${precoUnitario} (usuário ${itemEstoque.user_id})`);
              usuariosAtualizados++;
            }
          }
        }
        
        console.log(`✅ Preço atual aplicado para ${usuariosAtualizados} usuários`);
      }

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