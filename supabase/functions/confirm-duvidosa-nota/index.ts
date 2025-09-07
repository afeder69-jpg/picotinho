import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { notaImagemId, confirmed, userId } = await req.json();

    console.log(`Confirmação de nota duvidosa - ID: ${notaImagemId}, Confirmada: ${confirmed}, Usuário: ${userId}`);

    if (!notaImagemId || confirmed === undefined || !userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Parâmetros obrigatórios ausentes'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!confirmed) {
      // Usuário cancelou a inserção - marcar nota como rejeitada
      const { error: updateError } = await supabase
        .from('notas_imagens')
        .update({
          processada: false,
          dados_extraidos: null,
          debug_texto: 'Nota rejeitada pelo usuário - não é estabelecimento de consumo',
          updated_at: new Date().toISOString()
        })
        .eq('id', notaImagemId)
        .eq('usuario_id', userId);

      if (updateError) {
        console.error('Erro ao marcar nota como rejeitada:', updateError);
        throw updateError;
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Nota rejeitada pelo usuário',
        action: 'rejected'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Usuário confirmou - forçar processamento da nota
    console.log('Usuário confirmou processamento da nota duvidosa');

    // Buscar dados da nota
    const { data: notaImagem, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', notaImagemId)
      .eq('usuario_id', userId)
      .single();

    if (notaError || !notaImagem) {
      throw new Error('Nota não encontrada ou acesso negado');
    }

    // Determinar se é PDF ou imagem e chamar a função apropriada
    let processResult;
    
    if (notaImagem.imagem_url?.includes('.pdf') || notaImagem.nome_original?.toLowerCase().endsWith('.pdf')) {
      // Processar como PDF
      console.log('Forçando processamento de PDF duvidoso...');
      
      const { data: pdfResult, error: pdfError } = await supabase.functions.invoke('process-danfe-pdf', {
        body: {
          pdfUrl: notaImagem.imagem_url,
          notaImagemId: notaImagemId,
          userId: userId,
          forceProcess: true // Flag para pular validação
        }
      });

      if (pdfError) {
        console.error('Erro no processamento forçado do PDF:', pdfError);
        throw pdfError;
      }

      processResult = pdfResult;
    } else {
      // Processar como imagem
      console.log('Forçando processamento de imagem duvidosa...');
      
      const { data: imageResult, error: imageError } = await supabase.functions.invoke('process-receipt-full', {
        body: {
          notaImagemId: notaImagemId,
          userId: userId,
          forceProcess: true // Flag para pular validação
        }
      });

      if (imageError) {
        console.error('Erro no processamento forçado da imagem:', imageError);
        throw imageError;
      }

      processResult = imageResult;
    }

    console.log('Processamento forçado concluído:', processResult);

    return new Response(JSON.stringify({
      success: true,
      message: 'Nota processada com sucesso após confirmação do usuário',
      data: processResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro na confirmação de nota duvidosa:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Erro interno do servidor'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});