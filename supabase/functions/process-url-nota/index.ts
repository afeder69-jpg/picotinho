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

    const { url, userId, chaveAcesso, tipoDocumento } = await req.json();

    if (!url || !userId) {
      throw new Error('URL e userId são obrigatórios');
    }

    console.log('🌐 Processando URL da nota:', {
      userId,
      url,
      tipoDocumento,
      chaveAcesso: chaveAcesso ? `${chaveAcesso.substring(0, 4)}...${chaveAcesso.substring(40)}` : 'não fornecida',
      timestamp: new Date().toISOString()
    });

    // Extrair chave de acesso se não fornecida
    let chave = chaveAcesso;
    if (!chave) {
      // Tentar extrair da URL
      const urlObj = new URL(url);
      const params = urlObj.searchParams.get('p') || urlObj.searchParams.get('chNFe');
      
      if (params) {
        chave = params.split('|')[0];
      } else {
        // Tentar regex
        const match = url.match(/(\d{44})/);
        if (match) {
          chave = match[1];
        }
      }
    }

    if (!chave || chave.length !== 44) {
      throw new Error('Não foi possível extrair a chave de acesso da URL');
    }

    console.log('🔑 Chave de acesso extraída:', `${chave.substring(0, 4)}...${chave.substring(40)}`);

    // Detectar UF e modelo pelos dígitos da chave
    const uf = chave.substring(0, 2);
    const modelo = chave.substring(20, 22);
    
    console.log(`📍 UF: ${uf}, Modelo: ${modelo} (${modelo === '55' ? 'NFe' : modelo === '65' ? 'NFCe' : 'Desconhecido'})`);

    // Criar registro na notas_imagens com status pending
    const notaId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('notas_imagens')
      .insert({
        id: notaId,
        usuario_id: userId,
        imagem_path: 'qrcode://url',
        imagem_url: url,
        processada: false,
        dados_extraidos: {
          chave_acesso: chave,
          uf_emitente: uf,
          modelo_documento: modelo,
          tipo_documento: tipoDocumento || (modelo === '55' ? 'NFe' : 'NFCe'),
          url_original: url,
          metodo_captura: 'qrcode_url_direct',
          timestamp: new Date().toISOString()
        }
      });

    if (insertError) {
      console.error('❌ Erro ao criar nota:', insertError);
      throw insertError;
    }

    console.log('✅ Nota criada com sucesso:', notaId);
    console.log('🔍 [DEBUG] notaId que será retornado:', notaId);

    // ROTEAMENTO INTELIGENTE: Escolher API apropriada
    if (modelo === '55') {
      // NFe (modelo 55): Usar Serpro (qualquer UF)
      console.log('📄 [NFE] Processando via Serpro...');
      
      const { data: nfeData, error: nfeError } = await supabase.functions.invoke('process-nfe-serpro', {
        body: { 
          chaveAcesso: chave,
          userId: userId,
          notaImagemId: notaId
        }
      });

      if (nfeError) {
        console.error('⚠️ Erro ao processar NFe via Serpro:', nfeError);
        throw nfeError;
      }

      console.log('✅ NFe processada via Serpro:', nfeData);
      
    } else if (modelo === '65' && uf === '33') {
      // NFCe (modelo 65) do RJ (UF 33): Usar InfoSimples
      console.log('🎫 [NFCE-RJ] Processando via InfoSimples...');
      
      const { data: nfceData, error: nfceError } = await supabase.functions.invoke('process-nfce-infosimples', {
        body: { 
          chaveAcesso: chave,
          userId: userId,
          notaImagemId: notaId
        }
      });

      if (nfceError) {
        console.error('⚠️ Erro ao processar NFCe via InfoSimples:', nfceError);
        console.log('🔄 Tentando fallback via extração HTML...');
        
        // Fallback: Extração genérica
        const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
          body: { 
            notaImagemId: notaId,
            userId: userId
          }
        });

        if (extractError) {
          console.error('⚠️ Erro no fallback HTML:', extractError);
        } else {
          console.log('✅ Fallback concluído:', extractData);
        }
      } else {
        console.log('✅ NFCe-RJ processada via InfoSimples:', nfceData);
      }
      
    } else if (modelo === '65') {
      // NFCe de outras UFs: Extrair via HTML
      console.log(`🎫 [NFCE-${uf}] Processando via extração HTML (UF não suportada pelo InfoSimples)...`);
      
      const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
        body: { 
          notaImagemId: notaId,
          userId: userId
        }
      });

      if (extractError) {
        console.error('⚠️ Erro ao extrair NFCe:', extractError);
      } else {
        console.log('✅ NFCe extraída:', extractData);
      }
    } else {
      // Modelo desconhecido: Fallback genérico
      console.warn('⚠️ Modelo desconhecido, tentando extração genérica...');
      
      const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
        body: { 
          notaImagemId: notaId,
          userId: userId
        }
      });

      if (extractError) {
        console.error('⚠️ Erro na extração genérica:', extractError);
      } else {
        console.log('✅ Extração genérica concluída:', extractData);
      }
    }

    console.log('✅ [DEBUG] Retornando notaId:', notaId);
    
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
