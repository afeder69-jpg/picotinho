import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 ENVIO DE CÓDIGO WHATSAPP - INÍCIO');
    
    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { numeroCompleto, usuarioId } = await req.json();
    
    console.log('📱 Número a verificar:', numeroCompleto);
    console.log('👤 Usuário ID:', usuarioId);

    // Verificar se o número já está em uso por outro usuário
    const { data: numeroExistente, error: checkError } = await supabase
      .from('whatsapp_configuracoes')
      .select('usuario_id, verificado')
      .eq('numero_whatsapp', numeroCompleto)
      .maybeSingle();

    if (checkError) {
      console.error('❌ Erro ao verificar número existente:', checkError);
      throw new Error('Erro ao verificar número');
    }

    // Se número já existe e pertence a outro usuário
    if (numeroExistente && numeroExistente.usuario_id !== usuarioId) {
      console.log('⚠️ Número já cadastrado por outro usuário');
      return new Response(JSON.stringify({
        success: false,
        error: 'O número que você está tentando cadastrar já está registrado em nosso sistema por outro usuário. Tente um novo número ou envie um email para sac@picotinho.com.br se você é o proprietário deste número.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Se é o mesmo usuário recadastrando
    if (numeroExistente && numeroExistente.usuario_id === usuarioId) {
      console.log('🔄 Mesmo usuário recadastrando número');
      if (numeroExistente.verificado) {
        console.log('✅ Número já verificado - permitindo reverificação');
      }
    }

    // Gerar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('🔢 Código gerado:', codigo);

    // Salvar código no banco com timestamp
    const { error: dbError } = await supabase
      .from('whatsapp_configuracoes')
      .upsert({
        usuario_id: usuarioId,
        numero_whatsapp: numeroCompleto,
        codigo_verificacao: codigo,
        data_codigo: new Date().toISOString(),
        verificado: false,
        api_provider: 'z-api',
        ativo: true
      }, { onConflict: 'usuario_id' });

    if (dbError) {
      console.error('❌ Erro ao salvar código:', dbError);
      throw new Error('Erro ao salvar código no banco');
    }

    // Buscar configurações do WhatsApp
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

    if (!instanceUrl || !apiToken || !accountSecret) {
      console.error('❌ Configurações WhatsApp não encontradas');
      throw new Error('Configurações do WhatsApp não encontradas');
    }

    // Montar mensagem de verificação
    const mensagem = `Olá 👋 Eu sou o Picotinho, seu assistente de compras.
Este é o seu código para ativar o WhatsApp: ${codigo}`;

    // Enviar código via Z-API
    const sendUrl = `${instanceUrl}/token/${apiToken}/send-text`;
    
    console.log('📤 Enviando código via Z-API para:', numeroCompleto);
    
    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': accountSecret
      },
      body: JSON.stringify({
        phone: numeroCompleto,
        message: mensagem
      })
    });

    const responseData = await response.text();
    console.log('📊 Status Z-API:', response.status);
    console.log('📝 Resposta Z-API:', responseData);

    if (!response.ok) {
      throw new Error(`Erro ao enviar código: ${responseData}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Código enviado com sucesso!',
      codigoGerado: codigo // Para debug apenas
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Erro:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

serve(handler);