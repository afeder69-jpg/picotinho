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

    const { userId } = await req.json();

    console.log('Corrigindo preços zerados para usuário:', userId);

    // 1. Buscar todos os produtos no estoque do usuário que têm preço pago mas não têm preço atual
    const { data: produtosSemPrecoAtual } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId)
      .not('preco_unitario_ultimo', 'is', null)
      .gt('preco_unitario_ultimo', 0);

    if (!produtosSemPrecoAtual || produtosSemPrecoAtual.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhum produto com preço pago encontrado para correção',
        produtosCorrigidos: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Encontrados ${produtosSemPrecoAtual.length} produtos com preço pago`);

    let produtosCorrigidos = 0;

    // 2. Para cada produto, verificar se já existe preço atual
    for (const produto of produtosSemPrecoAtual) {
      try {
        // Verificar se já existe preço atual para este produto em algum estabelecimento
        const { data: precoAtualExistente } = await supabase
          .from('precos_atuais')
          .select('*')
          .ilike('produto_nome', `%${produto.produto_nome}%`)
          .order('data_atualizacao', { ascending: false })
          .limit(1);

        // Se não existe preço atual ou o existente é muito antigo, criar/atualizar com base no preço pago
        let deveAtualizarPreco = false;
        let estabelecimentoParaUsar = 'INSERÇÃO_MANUAL_' + userId.substring(0, 8);
        let estabelecimentoNome = 'Inserção Manual do Usuário';

        if (!precoAtualExistente || precoAtualExistente.length === 0) {
          // Não existe preço atual, usar preço pago
          deveAtualizarPreco = true;
          console.log(`📋 Produto sem preço atual: ${produto.produto_nome}`);
        } else {
          // Existe preço atual, verificar se é muito antigo (mais de 30 dias)
          const precoExistente = precoAtualExistente[0];
          const dataPrecoExistente = new Date(precoExistente.data_atualizacao);
          const agora = new Date();
          const diferencaDias = (agora.getTime() - dataPrecoExistente.getTime()) / (1000 * 3600 * 24);

          if (diferencaDias > 30) {
            // Preço atual muito antigo, usar preço pago como referência mais recente
            deveAtualizarPreco = true;
            estabelecimentoParaUsar = precoExistente.estabelecimento_cnpj;
            estabelecimentoNome = precoExistente.estabelecimento_nome;
            console.log(`📋 Produto com preço antigo (${Math.round(diferencaDias)} dias): ${produto.produto_nome}`);
          } else {
            console.log(`✅ Produto já tem preço atual recente: ${produto.produto_nome}`);
          }
        }

        if (deveAtualizarPreco) {
          // Buscar a nota fiscal mais recente deste produto para obter data/hora precisas
          const { data: notaRecente } = await supabase
            .from('notas_imagens')
            .select('dados_extraidos, data_criacao')
            .eq('usuario_id', userId)
            .eq('processada', true)
            .not('dados_extraidos', 'is', null)
            .order('data_criacao', { ascending: false });

          let dataAtualizacao = new Date().toISOString();
          
          // Buscar a data da compra mais recente deste produto
          if (notaRecente && notaRecente.length > 0) {
            for (const nota of notaRecente) {
              const dadosExtraidos = nota.dados_extraidos as any;
              if (dadosExtraidos?.itens) {
                const itemEncontrado = dadosExtraidos.itens.find((item: any) => 
                  item.nome && item.nome.toLowerCase().includes(produto.produto_nome.toLowerCase())
                );
                
                if (itemEncontrado && dadosExtraidos.compra?.data) {
                  const dataCompra = dadosExtraidos.compra.data;
                  const horaCompra = dadosExtraidos.compra.hora || '12:00:00';
                  dataAtualizacao = new Date(`${dataCompra}T${horaCompra}`).toISOString();
                  break;
                }
              }
            }
          }

          // Criar/atualizar preço atual usando o preço pago
          const { data: precoAtualizado, error: erroPreco } = await supabase
            .from('precos_atuais')
            .upsert({
              produto_nome: produto.produto_nome,
              estabelecimento_cnpj: estabelecimentoParaUsar,
              estabelecimento_nome: estabelecimentoNome,
              valor_unitario: produto.preco_unitario_ultimo,
              data_atualizacao: dataAtualizacao
            }, {
              onConflict: 'produto_nome,estabelecimento_cnpj'
            });

          if (erroPreco) {
            console.error(`❌ Erro ao atualizar preço para ${produto.produto_nome}:`, erroPreco);
          } else {
            console.log(`✅ Preço atual corrigido: ${produto.produto_nome} - R$ ${produto.preco_unitario_ultimo}`);
            produtosCorrigidos++;
          }
        }

      } catch (error) {
        console.error(`❌ Erro ao processar produto ${produto.produto_nome}:`, error);
      }
    }

    console.log(`✅ Correção concluída: ${produtosCorrigidos} produtos corrigidos`);

    return new Response(JSON.stringify({
      success: true,
      message: `Preços atuais corrigidos com sucesso`,
      produtosAnalisados: produtosSemPrecoAtual.length,
      produtosCorrigidos: produtosCorrigidos
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro ao corrigir preços zerados:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});