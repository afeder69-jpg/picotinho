import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

    // Buscar notas travadas (não processadas e sem debug_texto há mais de 10 minutos)
    const { data: notasTravadas } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('processada', false)
      .or('debug_texto.is.null,debug_texto.eq.AUSENTE')
      .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()); // 10 minutos atrás

    console.log(`🔍 Encontradas ${notasTravadas?.length || 0} notas travadas`);

    if (!notasTravadas || notasTravadas.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhuma nota travada encontrada',
        fixed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let fixed = 0;
    
    for (const nota of notasTravadas) {
      console.log(`🔧 Corrigindo nota travada: ${nota.id}`);
      
      // Se for JPG, marcar como erro (JPGs precisam ser processados de forma diferente)
      const isJPG = nota.imagem_path?.toLowerCase().includes('.jpg') || nota.imagem_path?.toLowerCase().includes('.jpeg');
      
      if (isJPG) {
        const { error } = await supabase
          .from('notas_imagens')
          .update({
            processada: true,
            debug_texto: 'ERRO: Arquivo JPG precisa ser convertido para PDF ou processado por OCR',
            dados_extraidos: {
              erro: 'Formato JPG não suportado pela extração de texto atual',
              tipo_arquivo: 'JPG',
              requer_ocr: true
            }
          })
          .eq('id', nota.id);

        if (!error) {
          fixed++;
          console.log(`✅ Nota JPG marcada como erro: ${nota.id}`);
        } else {
          console.error(`❌ Erro ao corrigir nota ${nota.id}:`, error);
        }
      } else {
        // Para PDFs sem texto extraído, tentar reprocessar
        console.log(`🔄 Nota PDF será reprocessada: ${nota.id}`);
        
        const { error } = await supabase
          .from('notas_imagens')
          .update({
            debug_texto: 'REPROCESSAR: Tentativa de extração de texto falhou'
          })
          .eq('id', nota.id);

        if (!error) {
          console.log(`🔄 Nota PDF marcada para reprocessamento: ${nota.id}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Corrigidas ${fixed} notas travadas`,
      fixed,
      total_found: notasTravadas.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erro ao corrigir notas travadas:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});