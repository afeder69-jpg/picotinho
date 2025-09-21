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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { imagemId, notaImagemId } = await req.json();
    const finalImagemId = imagemId || notaImagemId;

    if (!finalImagemId) {
      return new Response(
        JSON.stringify({ error: 'ID da imagem é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🏗️ [${new Date().toISOString()}] NOVA INSERÇÃO SIMPLES - ID: ${finalImagemId} - EXECUÇÃO INICIADA`);
    
    // ✅ VERIFICAR SE JÁ FOI PROCESSADA (sem bloquear reprocessamento)
    const { data: notaExistente, error: checkError } = await supabase
      .from('notas_imagens')
      .select('processada, dados_extraidos')
      .eq('id', finalImagemId)
      .single();
    
    if (checkError) {
      console.log(`❌ [${new Date().toISOString()}] ERRO AO VERIFICAR NOTA - ID: ${finalImagemId}`);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Erro ao verificar nota',
          nota_id: finalImagemId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Permitir reprocessamento se a nota tem dados extraídos
    if (notaExistente?.processada && !notaExistente?.dados_extraidos) {
      console.log(`⚠️ [${new Date().toISOString()}] NOTA JÁ PROCESSADA SEM DADOS - ID: ${finalImagemId} - ABORTANDO`);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Nota já foi processada sem dados extraídos',
          nota_id: finalImagemId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`🔒 [${new Date().toISOString()}] LOCK OBTIDO - PROCESSANDO NOTA: ${finalImagemId}`);

    // Buscar a nota com dados extraídos
    const { data: notaImagem, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', finalImagemId)
      .single();

    if (notaError || !notaImagem) {
      throw new Error(`Nota não encontrada: ${notaError?.message}`);
    }

    if (!notaImagem.dados_extraidos) {
      throw new Error('Nota não foi processada pela IA de extração');
    }

    // ⚠️ HOTFIX: Removido bloqueio por processada
    // A IA-1 é responsável pela duplicidade (44 dígitos)

    console.log(`📋 Nota encontrada - Usuário: ${notaImagem.usuario_id}`);
    console.log(`📦 Dados extraídos:`, JSON.stringify(notaImagem.dados_extraidos, null, 2));

    // ✅ INSERÇÃO SIMPLES - ESPELHO DIRETO DO CUPONZINHO
    const itens = notaImagem.dados_extraidos.itens || [];
    
    if (itens.length === 0) {
      throw new Error('Nenhum item encontrado na nota');
    }

    console.log(`📋 Processando ${itens.length} itens para inserção direta...`);

    let sucessos = 0;
    const resultados = [];
    
    // ✅ INSERÇÃO DIRETA: Espelho fiel do JSON da IA-2
    for (const item of itens) {
      try {
        // ✅ PRESERVAR DADOS ORIGINAIS: Sem forçar zeros
        const descricaoOriginal = String(item.descricao || '').trim();
        const descricao = descricaoOriginal || 'DESCRIÇÃO INVÁLIDA';
        
        // ✅ QUANTIDADE: Preservar valor exato da IA-2
        let quantidade = item.quantidade;
        if (quantidade !== null && quantidade !== undefined && quantidade !== '') {
          // Tentar converter string com vírgula para número
          if (typeof quantidade === 'string') {
            quantidade = parseFloat(quantidade.replace(",", "."));
          } else if (typeof quantidade === 'number') {
            // Já é número, manter como está
            quantidade = quantidade;
          }
          // Se não conseguir converter, manter o valor original
          if (isNaN(quantidade)) {
            quantidade = item.quantidade;
          }
        }
        
        // ✅ VALOR UNITÁRIO: Preservar valor exato da IA-2  
        let valorUnitario = item.valor_unitario;
        if (valorUnitario !== null && valorUnitario !== undefined && valorUnitario !== '') {
          // Tentar converter string com vírgula para número
          if (typeof valorUnitario === 'string') {
            valorUnitario = parseFloat(valorUnitario.replace(",", "."));
          } else if (typeof valorUnitario === 'number') {
            // Já é número, manter como está
            valorUnitario = valorUnitario;
          }
          // Se não conseguir converter, manter o valor original
          if (isNaN(valorUnitario)) {
            valorUnitario = item.valor_unitario;
          }
        }
        
        const unidade = String(item.unidade || 'UN').trim();
        const categoria = String(item.categoria || 'OUTROS');
        
        // Normalizar unidade sem alterar quantidade
        const unidadeNormalizada = unidade === 'Unidade' ? 'UN' : unidade.toUpperCase();
        
        console.log('INSERT_DIRETO', {
          produto: descricao,
          quantidade_original: item.quantidade,
          quantidade_processada: quantidade,
          valor_original: item.valor_unitario,
          valor_processado: valorUnitario,
          unidade: unidadeNormalizada,
          categoria: categoria
        });

        // ✅ ESPELHO FIEL: Objeto exato da IA-2
        const produto = {
          produto_nome: descricao,
          categoria: categoria,
          quantidade: quantidade,
          unidade_medida: unidadeNormalizada,
          preco_unitario_ultimo: valorUnitario,
          user_id: notaImagem.usuario_id,
          origem: 'nota_fiscal'
        };

        const { data: insertData, error: insertError } = await supabase
          .from('estoque_app')
          .insert(produto)
          .select();

        if (insertError) {
          console.error('INSERT_ERR', insertError);
          resultados.push({
            produto: descricao,
            status: 'erro',
            erro: insertError.message
          });
          continue;
        }

        console.log('INSERT_OK', insertData[0]?.id);
        sucessos++;
        resultados.push({
          produto: descricao,
          quantidade: quantidade,
          preco: valorUnitario,
          status: 'sucesso'
        });

      } catch (error) {
        console.error(`❌ Erro na inserção direta:`, error);
        console.error(`❌ Item que causou erro:`, JSON.stringify(item, null, 2));
        resultados.push({
          produto: item.descricao || 'Item com erro',
          status: 'erro',
          erro: error.message
        });
      }
    }

    // ✅ MARCAR COMO PROCESSADA APÓS INSERÇÃO SUCESSFUL
    if (sucessos > 0) {
      await supabase
        .from('notas_imagens')
        .update({ processada: true, updated_at: new Date().toISOString() })
        .eq('id', finalImagemId);
      console.log(`✅ Nota marcada como processada após ${sucessos} inserções`);
    }

    console.log(`🎯 [${new Date().toISOString()}] INSERÇÃO CONCLUÍDA: ${sucessos}/${itens.length} produtos inseridos - ID: ${finalImagemId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${sucessos} produtos inseridos no estoque`,
        itens_processados: itens.length,
        itens_inseridos: sucessos,
        resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na inserção:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});