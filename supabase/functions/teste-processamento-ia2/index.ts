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

    const { usuario_id } = await req.json();

    if (!usuario_id) {
      return new Response(
        JSON.stringify({ error: 'usuario_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🧪 TESTE: Processando notas pendentes via IA-2 para usuário: ${usuario_id}`);

    // Buscar notas com dados extraídos mas não processadas
    const { data: notasPendentes, error: notasError } = await supabase
      .from('notas_imagens')
      .select('id, dados_extraidos')
      .eq('usuario_id', usuario_id)
      .eq('processada', false)
      .not('dados_extraidos', 'is', null);

    if (notasError) {
      throw new Error(`Erro ao buscar notas pendentes: ${notasError.message}`);
    }

    if (!notasPendentes || notasPendentes.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Nenhuma nota pendente para processar via IA-2',
          processadas: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Encontradas ${notasPendentes.length} notas pendentes para processar`);

    let sucessos = 0;
    let erros = 0;
    const resultados = [];

    // Processar cada nota via IA-2
    for (const nota of notasPendentes) {
      try {
        console.log(`🎯 Processando nota ${nota.id} via IA-2...`);

        const { data: ia2Response, error: ia2Error } = await supabase.functions.invoke('normalizar-produto-ia2', {
          body: {
            notaId: nota.id,
            usuarioId: usuario_id,
            dadosExtraidos: nota.dados_extraidos,
            debug: true
          }
        });

        if (ia2Error) {
          throw new Error(`Erro na IA-2: ${ia2Error.message}`);
        }

        if (!ia2Response?.success) {
          throw new Error(`IA-2 falhou: ${ia2Response?.error || 'Erro desconhecido'}`);
        }

        sucessos++;
        resultados.push({
          nota_id: nota.id,
          status: 'sucesso',
          itens_processados: ia2Response.itens_processados
        });

        console.log(`✅ Nota ${nota.id} processada: ${ia2Response.itens_processados} produtos`);

      } catch (error) {
        erros++;
        resultados.push({
          nota_id: nota.id,
          status: 'erro',
          erro: error.message
        });

        console.error(`❌ Erro ao processar nota ${nota.id}:`, error);
      }
    }

    console.log(`📊 RESULTADO: ${sucessos} sucessos, ${erros} erros`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Processamento concluído: ${sucessos} notas processadas via IA-2, ${erros} erros`,
        processadas: sucessos,
        erros: erros,
        resultados: resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});