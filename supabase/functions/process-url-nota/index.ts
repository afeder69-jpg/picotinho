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

    const { url, userId } = await req.json();

    if (!url || !userId) {
      throw new Error('URL e userId são obrigatórios');
    }

    console.log('🌐 Iniciando scraping da URL:', {
      userId,
      url,
      timestamp: new Date().toISOString()
    });

    // Fazer fetch da URL com User-Agent de celular Android
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro ao acessar URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    console.log('✅ HTML obtido com sucesso:', {
      htmlLength: html.length,
      statusCode: response.status
    });

    // Validar se HTML contém dados de nota fiscal
    const hasNotaFiscalData = html.includes('DANFE') || 
                              html.includes('NF-e') || 
                              html.includes('Nota Fiscal') ||
                              html.includes('CNPJ') ||
                              html.includes('Chave de Acesso');

    if (!hasNotaFiscalData) {
      console.error('❌ HTML não contém dados de nota fiscal válidos');
      throw new Error('A URL não contém dados de nota fiscal válidos. Verifique se o link está correto.');
    }

    console.log('✅ HTML contém dados de nota fiscal válidos');

    // Criar registro na notas_imagens
    const notaId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('notas_imagens')
      .insert({
        id: notaId,
        usuario_id: userId,
        imagem_url: url,
        processada: false,
        dados_extraidos: {
          html_capturado: html.substring(0, 100000), // Primeiros 100k caracteres
          url_original: url,
          metodo_captura: 'browser_url_scraping',
          timestamp: new Date().toISOString()
        }
      });

    if (insertError) {
      console.error('❌ Erro ao criar nota:', insertError);
      throw insertError;
    }

    console.log('✅ Nota criada com sucesso:', notaId);

    // Chamar extração diretamente do HTML
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        notaId,
        message: 'URL processada e extração iniciada'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao processar URL:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Erro ao processar URL da nota fiscal'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
