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

    console.log(`🎯 PROCESSO UNIFICADO IA-2: ${finalImagemId}`);

    // Buscar nota existente
    const { data: notaImagem, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', finalImagemId)
      .single();

    if (notaError || !notaImagem) {
      throw new Error(`Nota não encontrada: ${notaError?.message}`);
    }

    if (!notaImagem.dados_extraidos) {
      throw new Error('Nota ainda não foi processada pela IA de extração');
    }

    // PERMITIR REPROCESSAMENTO SE ESTOQUE ESTIVER VAZIO
    if (notaImagem.processada) {
      // Verificar se há produtos no estoque para este usuário
      const { data: estoqueExistente, error: estoqueError } = await supabase
        .from('estoque_app')
        .select('id')
        .eq('user_id', notaImagem.usuario_id)
        .limit(1);
      
      if (estoqueError) {
        console.error('❌ Erro ao verificar estoque:', estoqueError);
      }
      
      if (estoqueExistente && estoqueExistente.length > 0) {
        console.log('⚠️ Nota já processada e estoque contém produtos, evitando duplicação');
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Nota já foi processada anteriormente e estoque não está vazio'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('🔄 Nota processada mas estoque vazio, reprocessando...');
      }
    }

    // ✅ INSERÇÃO DIRETA - SEM IA, SEM NORMALIZAÇÃO
    console.log(`📋 Inserindo produtos diretamente do cuponzinho...`);

    try {
      const { data: insertResult, error: insertError } = await supabase.functions.invoke('inserir-estoque-direto', {
        body: {
          notaId: finalImagemId,
          usuarioId: notaImagem.usuario_id
        }
      });

      if (insertError) {
        throw new Error(`Erro na inserção direta: ${insertError.message}`);
      }

      if (!insertResult?.success) {
        throw new Error(`Inserção direta falhou: ${insertResult?.error || 'Erro desconhecido'}`);
      }

      console.log(`✅ Inserção direta completa: ${insertResult.itens_inseridos} produtos inseridos`);

      return new Response(
        JSON.stringify({ 
          success: true,
          message: `Produtos inseridos diretamente do cuponzinho: ${insertResult.itens_inseridos} itens no estoque`,
          itens_inseridos: insertResult.itens_inseridos,
          resultados: insertResult.resultados
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('❌ Erro na inserção direta:', error);
      throw error;
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});