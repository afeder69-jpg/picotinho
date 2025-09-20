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

    console.log(`📋 ESPELHO PERFEITO - Processando nota: ${notaId}`);

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

    // Se a nota já foi processada, não processar novamente
    if (nota.processada) {
      console.log('⚠️ Nota já foi processada, evitando duplicação');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Nota já foi processada anteriormente',
          itens_inseridos: 0,
          resultados: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dadosExtraidos = nota.dados_extraidos;
    const itens = dadosExtraidos?.itens || [];

    if (!itens || itens.length === 0) {
      throw new Error('Nenhum item encontrado na nota');
    }

    console.log(`📦 Criando espelho perfeito: ${itens.length} produtos EXATAMENTE como na nota...`);

    let itensInseridos = 0;
    const resultados = [];

    // Inserir cada item EXATAMENTE como está na nota - SEM NENHUMA MODIFICAÇÃO
    for (const item of itens) {
      try {
        // Pegar dados EXATOS da nota - zero modificação
        const nomeExato = item.descricao || item.nome;
        const quantidadeExata = parseFloat(item.quantidade || 0);
        const precoExato = parseFloat(item.valor_unitario || 0);
        const categoriaExata = item.categoria || 'OUTROS';
        const unidadeExata = item.unidade || 'UN';

        if (!nomeExato || quantidadeExata <= 0) {
          console.log(`⚠️ Item inválido ignorado: ${nomeExato} | Qtd: ${quantidadeExata}`);
          continue;
        }

        console.log(`💾 ESPELHO: ${nomeExato} | ${quantidadeExata} ${unidadeExata} | R$ ${precoExato}`);

        // INSERIR DIRETO - sem verificar duplicatas, sem normalizar, sem modificar NADA
        const { data: insertData, error: insertError } = await supabase
          .from('estoque_app')
          .insert({
            user_id: usuarioId,
            produto_nome: nomeExato, // EXATO como na nota
            categoria: categoriaExata,
            quantidade: quantidadeExata,
            unidade_medida: unidadeExata,
            preco_unitario_ultimo: precoExato,
            origem: 'nota_fiscal'
          })
          .select();

        if (insertError) {
          console.error(`❌ Erro ao inserir ${nomeExato}:`, insertError);
          throw insertError;
        }
        
        console.log(`✅ ESPELHO CRIADO: ${nomeExato} - ID: ${insertData?.[0]?.id}`);

        itensInseridos++;
        resultados.push({
          produto: nomeExato,
          quantidade: quantidadeExata,
          preco: precoExato,
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

    console.log(`🎯 ESPELHO PERFEITO CRIADO: ${itensInseridos} produtos idênticos à nota`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${itensInseridos} produtos inseridos como espelho perfeito da nota`,
        itens_inseridos: itensInseridos,
        resultados: resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na criação do espelho:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});