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

    // ROTEAMENTO INTELIGENTE EM BACKGROUND: Iniciar processamento sem aguardar
    console.log('🚀 Iniciando processamento em background...');
    
    // @ts-ignore - EdgeRuntime global
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        processarNotaEmBackground(notaId, userId, chave, modelo, uf)
      );
    } else {
      // Fallback: processar sem aguardar (sem bloqueio)
      processarNotaEmBackground(notaId, userId, chave, modelo, uf);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        notaId,
        message: 'Processamento iniciado em background. Você será notificado quando estiver pronto.'
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

// ============================================================================
// FUNÇÃO DE PROCESSAMENTO EM BACKGROUND
// ============================================================================
async function processarNotaEmBackground(
  notaId: string, 
  userId: string, 
  chaveAcesso: string, 
  modelo: string, 
  uf: string
) {
  console.log(`🔄 [BACKGROUND] Iniciando processamento para nota ${notaId}`);
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    if (modelo === '55') {
      // NFe via Serpro
      console.log('📄 [BACKGROUND-NFE] Processando via Serpro...');
      const { error: nfeError } = await supabase.functions.invoke('process-nfe-serpro', {
        body: { chaveAcesso, userId, notaImagemId: notaId }
      });
      
      if (nfeError) {
        console.error('❌ [BACKGROUND-NFE] Erro:', nfeError);
        throw nfeError;
      }
      console.log('✅ [BACKGROUND-NFE] Processada com sucesso');
      
    } else if (modelo === '65' && uf === '33') {
      // NFCe-RJ via InfoSimples
      console.log('🎫 [BACKGROUND-NFCE-RJ] Processando via InfoSimples...');
      const { error: nfceError } = await supabase.functions.invoke('process-nfce-infosimples', {
        body: { chaveAcesso, userId, notaImagemId: notaId }
      });
      
      if (nfceError) {
        console.error('⚠️ [BACKGROUND-NFCE-RJ] Erro no InfoSimples, tentando fallback HTML...');
        
        // Fallback para extração HTML
        await supabase.functions.invoke('extract-receipt-image', {
          body: { notaImagemId: notaId, userId }
        });
      } else {
        console.log('✅ [BACKGROUND-NFCE-RJ] Processada com sucesso');
      }
      
    } else if (modelo === '65') {
      // NFCe outras UFs via extração HTML
      console.log(`🎫 [BACKGROUND-NFCE-${uf}] Processando via extração HTML...`);
      await supabase.functions.invoke('extract-receipt-image', {
        body: { notaImagemId: notaId, userId }
      });
      console.log('✅ [BACKGROUND-NFCE] Extraída com sucesso');
      
    } else {
      // Modelo desconhecido
      console.warn('⚠️ [BACKGROUND] Modelo desconhecido, tentando extração genérica...');
      await supabase.functions.invoke('extract-receipt-image', {
        body: { notaImagemId: notaId, userId }
      });
    }
    
    // Marcar como pendente de aprovação
    const { error: updateError } = await supabase
      .from('notas_imagens')
      .update({ status_aprovacao: 'pendente_aprovacao' })
      .eq('id', notaId);
    
    if (updateError) {
      console.error('❌ [BACKGROUND] Erro ao atualizar status:', updateError);
    } else {
      console.log(`✅ [BACKGROUND] Nota ${notaId} pronta - aguardando aprovação do usuário`);
    }
    
  } catch (error) {
    console.error(`❌ [BACKGROUND] Erro ao processar nota ${notaId}:`, error);
    
    // Marcar nota com erro no banco
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('notas_imagens')
        .update({ 
          processada: false,
          dados_extraidos: { 
            erro: error.message,
            timestamp_erro: new Date().toISOString() 
          }
        })
        .eq('id', notaId);
    } catch (dbError) {
      console.error('❌ [BACKGROUND] Erro ao registrar falha no banco:', dbError);
    }
  }
}
