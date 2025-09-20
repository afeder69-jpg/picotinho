import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { notaId, usuarioId } = await req.json();

    if (!notaId || !usuarioId) {
      return new Response(
        JSON.stringify({ error: 'notaId e usuarioId são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 INSERÇÃO DIRETA - Processando nota: ${notaId}`);

    // Buscar dados extraídos da nota
    const { data: nota, error: notaError } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos, processada')
      .eq('id', notaId)
      .eq('usuario_id', usuarioId)
      .single();

    if (notaError || !nota) {
      throw new Error(`Nota não encontrada: ${notaError?.message}`);
    }

    // PERMITIR REPROCESSAMENTO SE ESTOQUE ESTIVER VAZIO OU COM QUANTIDADES ZERADAS
    if (nota.processada) {
      // Verificar se há produtos no estoque com quantidades > 0
      const { data: estoqueComQuantidade, error: estoqueError } = await supabase
        .from('estoque_app')
        .select('id, produto_nome, quantidade')
        .eq('user_id', usuarioId)
        .gt('quantidade', 0);
      
      if (estoqueError) {
        console.error('❌ Erro ao verificar estoque:', estoqueError);
      }
      
      console.log(`🔍 Produtos com quantidade > 0 no estoque: ${estoqueComQuantidade?.length || 0}`);
      
      if (estoqueComQuantidade && estoqueComQuantidade.length > 0) {
        console.log('⚠️ Nota já processada e estoque contém produtos com quantidade, evitando duplicação');
        console.log('📦 Produtos existentes:', estoqueComQuantidade.map(p => `${p.produto_nome} (${p.quantidade})`));
        return new Response(
          JSON.stringify({ success: true, message: 'Nota já foi processada anteriormente e estoque contém produtos com quantidade' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('🔄 Nota processada mas estoque sem produtos com quantidade > 0, reprocessando...');
      }
    }

    const dadosExtraidos = nota.dados_extraidos;
    const itens = dadosExtraidos?.itens || [];

    if (!itens || itens.length === 0) {
      throw new Error('Nenhum item encontrado na nota');
    }

    console.log(`📦 Inserindo ${itens.length} produtos diretamente do cuponzinho...`);

    let itensInseridos = 0;
    const resultados = [];

    // Processar cada item EXATAMENTE como está no cuponzinho
    for (const item of itens) {
      try {
        const nomeOriginal = item.descricao || item.nome;
        const quantidade = parseFloat(item.quantidade || 0);
        const precoUnitario = parseFloat(item.valor_unitario || 0);
        const categoria = item.categoria || 'OUTROS';
        const unidade = item.unidade || 'UN';

        if (!nomeOriginal || quantidade <= 0) {
          console.log(`⚠️ Item inválido ignorado: ${nomeOriginal} | Qtd: ${quantidade}`);
          continue;
        }

        console.log(`💾 Inserindo: ${nomeOriginal} | ${quantidade} ${unidade} | R$ ${precoUnitario}`);

        // USAR SERVICE ROLE - verificar se produto já existe no estoque (busca por nome exato)
        const { data: produtoExistente, error: selectError } = await supabase
          .from('estoque_app')
          .select('*')
          .eq('user_id', usuarioId)
          .eq('produto_nome', nomeOriginal.toUpperCase().trim())
          .maybeSingle();

        if (selectError) {
          console.error(`❌ Erro ao buscar produto ${nomeOriginal}:`, selectError);
          throw selectError;
        }

        if (produtoExistente) {
          // Atualizar quantidade existente
          const novaQuantidade = parseFloat(produtoExistente.quantidade) + quantidade;
          
          const { data: updateData, error: updateError } = await supabase
            .from('estoque_app')
            .update({
              quantidade: novaQuantidade,
              preco_unitario_ultimo: precoUnitario,
              updated_at: new Date().toISOString()
            })
            .eq('id', produtoExistente.id)
            .select();

          if (updateError) {
            console.error(`❌ Erro ao atualizar ${nomeOriginal}:`, updateError);
            throw updateError;
          }
          
          console.log(`✅ Quantidade atualizada: ${nomeOriginal} (${produtoExistente.quantidade} + ${quantidade} = ${novaQuantidade})`);
        } else {
          // Inserir novo produto - USANDO SERVICE ROLE
          const { data: insertData, error: insertError } = await supabase
            .from('estoque_app')
            .insert({
              user_id: usuarioId,
              produto_nome: nomeOriginal.toUpperCase().trim(),
              categoria: categoria.toUpperCase(),
              quantidade: quantidade,
              unidade_medida: unidade.toUpperCase(),
              preco_unitario_ultimo: precoUnitario,
              origem: 'nota_fiscal'
            })
            .select();

          if (insertError) {
            console.error(`❌ Erro ao inserir ${nomeOriginal}:`, insertError);
            throw insertError;
          }
          
          console.log(`✅ Novo produto inserido: ${nomeOriginal} (${quantidade} ${unidade}) - ID: ${insertData?.[0]?.id}`);
        }

        itensInseridos++;
        resultados.push({
          produto: nomeOriginal,
          quantidade: quantidade,
          preco: precoUnitario,
          status: 'inserido'
        });

      } catch (error) {
        console.error(`❌ Erro ao inserir item:`, error);
        resultados.push({
          produto: item.descricao || item.nome,
          status: 'erro',
          erro: error.message
        });
      }
    }

    // Marcar nota como processada
    const { error: updateError } = await supabase
      .from('notas_imagens')
      .update({
        processada: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', notaId);

    if (updateError) {
      console.error('❌ Erro ao marcar nota como processada:', updateError);
    }

    console.log(`🎯 INSERÇÃO DIRETA COMPLETA: ${itensInseridos} produtos inseridos`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${itensInseridos} produtos inseridos diretamente do cuponzinho no estoque`,
        itens_inseridos: itensInseridos,
        resultados: resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na inserção direta:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});