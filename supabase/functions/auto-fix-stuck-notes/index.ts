import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔧 Auto-Fix: Iniciando varredura de notas travadas...');

    // 1. Buscar notas travadas há mais de 2 minutos
    const tenMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    
    const { data: notasTravadas } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('processada', false)
      .or('debug_texto.is.null,debug_texto.eq.AUSENTE')
      .lt('created_at', tenMinutesAgo);

    if (!notasTravadas || notasTravadas.length === 0) {
      console.log('✅ Nenhuma nota travada encontrada');
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhuma nota travada encontrada',
        fixed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔍 Encontradas ${notasTravadas.length} notas travadas`);

    let fixed = 0;
    let errors = 0;

    for (const nota of notasTravadas) {
      try {
        console.log(`🔧 Analisando nota: ${nota.id}`);
        
        // Verificar se é JPG/JPEG baseado no caminho da imagem
        const isJPG = nota.imagem_path?.toLowerCase().includes('.jpg') || 
                     nota.imagem_path?.toLowerCase().includes('.jpeg') ||
                     nota.nome_original?.toLowerCase().includes('.jpg') ||
                     nota.nome_original?.toLowerCase().includes('.jpeg');

        if (isJPG) {
          console.log(`📸 Nota JPG detectada: ${nota.id} - marcando como erro`);
          
          const { error } = await supabase
            .from('notas_imagens')
            .update({
              processada: true,
              debug_texto: 'ERRO_AUTO_FIX: Arquivo JPG detectado - não pode ser processado pela função PDF. Necesário implementar OCR ou converter para PDF.',
              dados_extraidos: {
                erro: 'Formato JPG não suportado',
                tipo_arquivo: 'JPG',
                corrigido_automaticamente: true,
                timestamp_correcao: new Date().toISOString(),
                motivo: 'Arquivo de imagem detectado em função de processamento PDF'
              }
            })
            .eq('id', nota.id);

          if (error) {
            console.error(`❌ Erro ao corrigir nota JPG ${nota.id}:`, error);
            errors++;
          } else {
            console.log(`✅ Nota JPG corrigida: ${nota.id}`);
            fixed++;
          }
        } else {
          // Para PDFs, verificar se existe o arquivo
          console.log(`📄 Nota PDF detectada: ${nota.id} - verificando arquivo`);
          
          if (nota.imagem_url) {
            try {
              const response = await fetch(nota.imagem_url);
              if (!response.ok) {
                console.log(`❌ Arquivo não encontrado: ${nota.imagem_url}`);
                
                const { error } = await supabase
                  .from('notas_imagens')
                  .update({
                    processada: true,
                    debug_texto: 'ERRO_AUTO_FIX: Arquivo PDF não encontrado no storage',
                    dados_extraidos: {
                      erro: 'Arquivo não encontrado',
                      tipo_arquivo: 'PDF',
                      corrigido_automaticamente: true,
                      timestamp_correcao: new Date().toISOString()
                    }
                  })
                  .eq('id', nota.id);

                if (!error) fixed++;
              } else {
                console.log(`🔄 PDF válido encontrado: ${nota.id} - marcando para reprocessamento`);
                
                const { error } = await supabase
                  .from('notas_imagens')
                  .update({
                    debug_texto: 'REPROCESSAR_AUTO_FIX: Arquivo PDF válido - tentando novamente extração de texto'
                  })
                  .eq('id', nota.id);

                if (!error) {
                  console.log(`🔄 Nota marcada para reprocessamento: ${nota.id}`);
                }
              }
            } catch (fetchError) {
              console.error(`❌ Erro ao verificar arquivo ${nota.imagem_url}:`, fetchError);
              errors++;
            }
          } else {
            console.log(`❌ Nota sem URL de imagem: ${nota.id}`);
            
            const { error } = await supabase
              .from('notas_imagens')
              .update({
                processada: true,
                debug_texto: 'ERRO_AUTO_FIX: Nota sem URL de imagem válida',
                dados_extraidos: {
                  erro: 'URL de imagem ausente',
                  corrigido_automaticamente: true,
                  timestamp_correcao: new Date().toISOString()
                }
              })
              .eq('id', nota.id);

            if (!error) fixed++;
          }
        }
      } catch (itemError) {
        console.error(`❌ Erro ao processar nota ${nota.id}:`, itemError);
        errors++;
      }
    }

    const message = `Auto-Fix concluído: ${fixed} notas corrigidas, ${errors} erros`;
    console.log(`🏁 ${message}`);

    return new Response(JSON.stringify({
      success: true,
      message,
      fixed,
      errors,
      total_found: notasTravadas.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erro no Auto-Fix:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});