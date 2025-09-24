import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("🔧 [FIX] Iniciando correção de notas PDF corrompidas...");

    // Buscar notas que estão travadas (não processadas há mais de 10 minutos)
    const { data: notasTravadas, error: errorBusca } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('processada', false)
      .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (errorBusca) {
      console.error("❌ Erro ao buscar notas travadas:", errorBusca);
      throw errorBusca;
    }

    console.log(`🔍 [FIX] Encontradas ${notasTravadas?.length || 0} notas travadas`);

    let notasCorrigidas = 0;
    let notasComErro = 0;

    for (const nota of notasTravadas || []) {
      try {
        console.log(`🔧 [FIX] Verificando nota: ${nota.id} - ${nota.nome_original || 'sem nome'}`);

        // Verificar se tem debug_texto como "AUSENTE" - indica PDF corrompido
        const isCorrupted = !nota.debug_texto || nota.debug_texto === "AUSENTE" || nota.debug_texto === "PDF_CORROMPIDO";

        if (isCorrupted) {
          console.log(`❌ [FIX] PDF corrompido detectado: ${nota.id}`);
          
          // Marcar como processada com erro
          const { error: errorUpdate } = await supabase
            .from('notas_imagens')
            .update({
              processada: true,
              dados_extraidos: { 
                error: "PDF_CORROMPIDO", 
                message: "PDF está corrompido ou contém dados binários - não pode ser processado",
                timestamp: new Date().toISOString()
              },
              debug_texto: "PDF_CORROMPIDO",
              updated_at: new Date().toISOString()
            })
            .eq('id', nota.id);

          if (errorUpdate) {
            console.error(`❌ [FIX] Erro ao atualizar nota ${nota.id}:`, errorUpdate);
            notasComErro++;
          } else {
            console.log(`✅ [FIX] Nota corrompida marcada como falha: ${nota.id}`);
            notasCorrigidas++;
          }
        } else {
          // Verificar se pode tentar reprocessar
          const tempoEspera = Date.now() - new Date(nota.created_at).getTime();
          if (tempoEspera > 30 * 60 * 1000) { // Mais de 30 minutos
            console.log(`⏰ [FIX] Nota muito antiga, marcando como falha por timeout: ${nota.id}`);
            
            const { error: errorTimeout } = await supabase
              .from('notas_imagens')
              .update({
                processada: true,
                dados_extraidos: { 
                  error: "TIMEOUT", 
                  message: "Processamento excedeu limite de tempo - falha por timeout",
                  timestamp: new Date().toISOString()
                },
                debug_texto: "TIMEOUT_PROCESSAMENTO",
                updated_at: new Date().toISOString()
              })
              .eq('id', nota.id);

            if (!errorTimeout) {
              notasCorrigidas++;
            } else {
              notasComErro++;
            }
          }
        }
      } catch (err) {
        console.error(`❌ [FIX] Erro ao processar nota ${nota.id}:`, err);
        notasComErro++;
      }
    }

    const resultado = {
      success: true,
      notasEncontradas: notasTravadas?.length || 0,
      notasCorrigidas,
      notasComErro,
      message: `Correção concluída: ${notasCorrigidas} notas corrigidas, ${notasComErro} com erro`
    };

    console.log("✅ [FIX] Correção concluída:", resultado);

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ [FIX] Erro na correção:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});