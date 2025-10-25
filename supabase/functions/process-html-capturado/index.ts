import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { html, userId, url } = await req.json();

    if (!html || !userId) {
      throw new Error('HTML e userId são obrigatórios');
    }

    console.log('📥 Recebendo HTML capturado:', {
      userId,
      url,
      htmlLength: html.length,
      timestamp: new Date().toISOString()
    });

    // Validar se HTML contém dados de nota fiscal
    const hasNotaFiscalData = html.includes('DANFE') || 
                              html.includes('NF-e') || 
                              html.includes('Nota Fiscal') ||
                              html.includes('CNPJ') ||
                              html.includes('Chave de Acesso');

    if (!hasNotaFiscalData) {
      console.error('❌ HTML não contém dados de nota fiscal válidos');
      throw new Error('HTML não contém dados de nota fiscal. Verifique se a página carregou corretamente.');
    }

    console.log('✅ HTML contém dados de nota fiscal válidos');

    // Criar registro na notas_imagens
    const notaId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('notas_imagens')
      .insert({
        id: notaId,
        usuario_id: userId,
        imagem_url: url || 'inappbrowser_capture',
        processada: false,
        dados_extraidos: {
          html_capturado: html.substring(0, 100000), // Primeiros 100k caracteres
          url_original: url,
          metodo_captura: 'inappbrowser_html',
          timestamp: new Date().toISOString()
        }
      });

    if (insertError) {
      console.error('❌ Erro ao criar nota:', insertError);
      throw insertError;
    }

    console.log('✅ Nota criada com sucesso:', notaId);

    // Passo 1: Chamar extração diretamente do HTML
    console.log('🔄 Iniciando extração de dados...');
    
    const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
      body: { 
        notaImagemId: notaId,
        userId: userId
      }
    });

    if (extractError) {
      console.error('⚠️ Erro ao iniciar extração:', extractError);
      // Não falhamos aqui, a extração será tentada posteriormente
    } else {
      console.log('✅ Extração iniciada:', extractData);
    }

    // Passo 2: Processar e adicionar ao estoque
    console.log('📦 Chamando process-receipt-full...');
    
    const { data: processData, error: processError } = await supabase.functions.invoke('process-receipt-full', {
      body: { 
        imagemId: notaId,
        force: true
      }
    });

    if (processError) {
      console.error('⚠️ Erro no processamento do estoque:', processError);
      // Não falha aqui - usuário pode processar manualmente depois
    } else {
      console.log('✅ Produtos adicionados ao estoque com sucesso!', processData);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        notaId,
        message: 'HTML capturado e processamento iniciado'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao processar HTML capturado:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Erro ao processar HTML capturado'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
