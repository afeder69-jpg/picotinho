import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId } = await req.json();

    console.log('🔄 Recalculando preços atuais das notas fiscais para usuário:', userId);

    // Buscar todas as notas fiscais processadas do usuário
    const { data: notas, error: erroNotas } = await supabase
      .from('notas_imagens')
      .select('id, dados_extraidos, created_at')
      .eq('usuario_id', userId)
      .eq('processada', true)
      .not('dados_extraidos', 'is', null)
      .order('created_at', { ascending: true }); // Processar em ordem cronológica

    if (erroNotas) {
      throw new Error(`Erro ao buscar notas: ${erroNotas.message}`);
    }

    console.log(`📄 Encontradas ${notas.length} notas processadas`);

    let totalItensProcessados = 0;
    let erros = [];

    // Processar cada nota em ordem cronológica
    for (const nota of notas) {
      try {
        const dadosExtraidos = nota.dados_extraidos;
        
        // Extrair dados do estabelecimento
        const cnpjEstabelecimento = dadosExtraidos?.cnpj || 
                                  dadosExtraidos?.estabelecimento?.cnpj || 
                                  dadosExtraidos?.supermercado?.cnpj ||
                                  dadosExtraidos?.emitente?.cnpj;
        
        const nomeEstabelecimento = dadosExtraidos?.estabelecimento?.nome || 
                                  dadosExtraidos?.supermercado?.nome ||
                                  dadosExtraidos?.emitente?.nome ||
                                  'Estabelecimento';

        // Extrair data e hora da compra
        const dataCompra = dadosExtraidos?.data_compra || 
                          dadosExtraidos?.compra?.data ||
                          dadosExtraidos?.data;
        
        const horaCompra = dadosExtraidos?.hora_compra || 
                          dadosExtraidos?.compra?.hora ||
                          dadosExtraidos?.hora;

        console.log(`📋 Processando nota ${nota.id} - CNPJ: ${cnpjEstabelecimento}, Data: ${dataCompra}`);

        // Processar itens da nota
        const itens = dadosExtraidos?.itens || [];
        for (const item of itens) {
          const produtoNome = item.descricao || item.nome;
          const valorUnitario = parseFloat(item.valor_unitario || 0);

          if (produtoNome && valorUnitario > 0) {
            try {
              // Chamar função update-precos-atuais para cada item
              const { data, error } = await supabase.functions.invoke('update-precos-atuais', {
                body: {
                  compraId: nota.id,
                  produtoNome: produtoNome,
                  precoUnitario: valorUnitario,
                  estabelecimentoCnpj: cnpjEstabelecimento,
                  estabelecimentoNome: nomeEstabelecimento,
                  dataCompra: dataCompra,
                  horaCompra: horaCompra,
                  userId: userId
                }
              });

              if (error) {
                console.error(`❌ Erro ao atualizar preço para ${produtoNome}:`, error);
                erros.push(`${produtoNome}: ${error.message}`);
              } else {
                console.log(`✅ Preço atualizado: ${produtoNome} = R$ ${valorUnitario}`);
                totalItensProcessados++;
              }
            } catch (error) {
              console.error(`❌ Erro ao processar item ${produtoNome}:`, error);
              erros.push(`${produtoNome}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Erro ao processar nota ${nota.id}:`, error);
        erros.push(`Nota ${nota.id}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Recálculo de preços concluído',
      totalNotas: notas.length,
      totalItensProcessados,
      erros: erros.length > 0 ? erros : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro no recálculo de preços:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});