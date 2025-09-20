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

    if (notaImagem.processada) {
      console.log('⚠️ Nota já processada, evitando duplicação');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Nota já foi processada anteriormente'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ ÚNICO PROCESSAMENTO AUTORIZADO: IA-2
    console.log(`🎯 Delegando EXCLUSIVAMENTE para IA-2...`);

    try {
      const { data: ia2Response, error: ia2Error } = await supabase.functions.invoke('normalizar-produto-ia2', {
        body: {
          notaId: finalImagemId,
          usuarioId: notaImagem.usuario_id,
          dadosExtraidos: notaImagem.dados_extraidos,
          debug: true
        }
      });

      if (ia2Error) {
        throw new Error(`Erro na IA-2: ${ia2Error.message}`);
      }

      if (!ia2Response?.success) {
        throw new Error(`IA-2 falhou: ${ia2Response?.error || 'Erro desconhecido'}`);
      }

      console.log(`✅ IA-2 processou completamente: ${ia2Response.itens_processados} produtos inseridos`);

      return new Response(
        JSON.stringify({ 
          success: true,
          message: `IA-2 processou nota: ${ia2Response.itens_processados} produtos no estoque`,
          itens_processados: ia2Response.itens_processados
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('❌ Erro ao chamar IA-2:', error);
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