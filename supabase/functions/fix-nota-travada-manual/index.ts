import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { notaId } = await req.json();
    
    if (!notaId) {
      return new Response(
        JSON.stringify({ error: 'notaId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔧 Corrigindo nota travada:', notaId);

    // 1. Buscar a nota
    const { data: nota, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', notaId)
      .single();

    if (notaError || !nota) {
      return new Response(
        JSON.stringify({ error: 'Nota não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📄 Nota encontrada:', nota.imagem_url);

    // 2. Processar com process-danfe-pdf
    try {
      const { data: pdfResult, error: pdfError } = await supabase.functions.invoke('process-danfe-pdf', {
        body: { 
          pdfUrl: nota.imagem_url,
          notaImagemId: notaId
        }
      });

      if (pdfError) {
        console.error('❌ Erro no process-danfe-pdf:', pdfError);
        
        // Se falhar, tentar marcar como processada com dados mínimos
        await supabase
          .from('notas_imagens')
          .update({ 
            processada: true,
            debug_texto: 'ERRO_PROCESSAMENTO_PDF',
            updated_at: new Date().toISOString()
          })
          .eq('id', notaId);

        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Erro no processamento do PDF',
            nota_marcada_erro: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ PDF processado com sucesso:', pdfResult);

      // 3. Se foi bem-sucedido, tentar normalizar
      if (pdfResult?.success && pdfResult?.nota_id) {
        console.log('🧠 Iniciando normalização...');
        
        const { data: normResult, error: normError } = await supabase.functions.invoke('normalizar-produto-ia2', {
          body: { 
            notaId: pdfResult.nota_id,
            usuarioId: nota.usuario_id
          }
        });

        if (normError) {
          console.error('❌ Erro na normalização:', normError);
        } else {
          console.log('✅ Normalização concluída:', normResult);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          pdf_processado: !!pdfResult?.success,
          nota_id: pdfResult?.nota_id || notaId,
          normalizacao_tentada: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('❌ Erro geral:', error);
      
      // Marcar como erro
      await supabase
        .from('notas_imagens')
        .update({ 
          processada: true,
          debug_texto: `ERRO_GERAL: ${error.message}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', notaId);

      return new Response(
        JSON.stringify({ 
          success: false,
          error: error.message,
          nota_marcada_erro: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('❌ Erro na função:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});