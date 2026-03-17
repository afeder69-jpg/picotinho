/**
 * 🔄 FLUXO AUTOMÁTICO DE PROCESSAMENTO DE NOTAS FISCAIS
 * 
 * Este edge function é o PONTO DE ENTRADA do processamento automático de notas.
 * 
 * FLUXO COMPLETO (100% AUTOMÁTICO):
 * 1. QR Code escaneado → handleQRScanSuccess (BottomNavigation.tsx)
 * 2. → process-url-nota (ESTE ARQUIVO) - extrai dados e roteia
 * 3. → process-nfe-serpro OU process-nfce-infosimples OU extract-receipt-image
 * 4. → Salva dados_extraidos em notas_imagens
 * 5. → Frontend detecta via realtime (BottomNavigation.tsx)
 * 6. → processarNotaAutomaticamente() gera PDF e valida
 * 7. → validate-receipt verifica duplicatas
 * 8. → process-receipt-full processa estoque com normalização
 * 
 * ⚠️ NÃO HÁ CONFIRMAÇÃO MANUAL DO USUÁRIO
 * Todo o processo é automático após o scan do QR Code.
 */
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

    const extrairChaveDaUrl = (valor: string) => {
      try {
        const urlObj = new URL(valor);
        const params = urlObj.searchParams.get('p') || urlObj.searchParams.get('chNFe') || urlObj.searchParams.get('chave');
        if (params) {
          return params.split('|')[0].replace(/\D/g, '');
        }
      } catch (_) {
        // Ignorar e seguir para regex
      }

      const match = valor.match(/(\d{44})/);
      return match?.[1] ?? null;
    };

    const chave = (chaveAcesso || extrairChaveDaUrl(url) || '').replace(/\D/g, '');

    if (chave.length !== 44) {
      throw new Error('Não foi possível extrair uma chave de acesso válida com 44 dígitos');
    }

    const uf = chave.substring(0, 2);
    const modelo = chave.substring(20, 22);
    const tipoDetectado = modelo === '55' ? 'NFe' : modelo === '65' ? 'NFCe' : null;

    if (!tipoDetectado) {
      throw new Error(`Modelo de documento inválido na chave de acesso: ${modelo}`);
    }

    console.log('🔑 Chave de acesso extraída:', `${chave.substring(0, 4)}...${chave.substring(40)}`);
    console.log(`📍 UF: ${uf}, Modelo: ${modelo} (${tipoDetectado})`);

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
          tipo_documento: tipoDocumento || tipoDetectado,
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

    if (modelo === '55') {
      console.log('📄 [NFE] Processando via InfoSimples...');

      const { data: nfeData, error: nfeError } = await supabase.functions.invoke('process-nfe-infosimples', {
        body: {
          chaveAcesso: chave,
          userId,
          notaImagemId: notaId
        }
      });

      if (nfeError) {
        console.error('⚠️ Erro ao processar NFe via InfoSimples:', nfeError);
        throw nfeError;
      }

      console.log('✅ NFe processada via InfoSimples:', nfeData);
    } else if (modelo === '65' && uf === '33') {
      console.log('🎫 [NFCE-RJ] Processando via InfoSimples...');

      const { data: nfceData, error: nfceError } = await supabase.functions.invoke('process-nfce-infosimples', {
        body: {
          chaveAcesso: chave,
          userId,
          notaImagemId: notaId
        }
      });

      if (nfceError) {
        console.error('⚠️ Erro ao processar NFCe via InfoSimples:', nfceError);
        console.log('🔄 Tentando fallback via extração HTML...');

        const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
          body: {
            notaImagemId: notaId,
            userId
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
      console.log(`🎫 [NFCE-${uf}] Processando via extração HTML (UF não suportada pelo InfoSimples)...`);

      const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
        body: {
          notaImagemId: notaId,
          userId
        }
      });

      if (extractError) {
        console.error('⚠️ Erro ao extrair NFCe:', extractError);
      } else {
        console.log('✅ NFCe extraída:', extractData);
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
