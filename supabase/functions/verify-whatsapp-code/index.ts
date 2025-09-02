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
    console.log('🔍 VERIFICAÇÃO DE CÓDIGO WHATSAPP - INÍCIO');
    
    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { codigo, usuarioId } = await req.json();
    
    console.log('🔢 Código recebido:', codigo);
    console.log('👤 Usuário ID:', usuarioId);

    // Buscar configuração do usuário
    const { data: config, error: configError } = await supabase
      .from('whatsapp_configuracoes')
      .select('*')
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    if (configError || !config) {
      console.error('❌ Configuração não encontrada:', configError);
      throw new Error('Configuração não encontrada');
    }

    // Verificar se código está correto e não expirou (5 minutos)
    const agora = new Date();
    const dataCode = new Date(config.data_codigo);
    const diffMinutos = (agora.getTime() - dataCode.getTime()) / (1000 * 60);

    if (diffMinutos > 5) {
      console.log('⏰ Código expirado - diferença em minutos:', diffMinutos);
      return new Response(JSON.stringify({
        success: false,
        error: 'Código expirado. Solicite um novo código.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (config.codigo_verificacao !== codigo) {
      console.log('❌ Código incorreto - esperado:', config.codigo_verificacao, 'recebido:', codigo);
      return new Response(JSON.stringify({
        success: false,
        error: 'Código incorreto. Verifique e tente novamente.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Marcar como verificado
    const { error: updateError } = await supabase
      .from('whatsapp_configuracoes')
      .update({
        verificado: true,
        codigo_verificacao: null,
        data_codigo: null
      })
      .eq('usuario_id', usuarioId);

    if (updateError) {
      console.error('❌ Erro ao atualizar verificação:', updateError);
      throw new Error('Erro ao confirmar verificação');
    }

    // Enviar mensagem de boas-vindas
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

    if (instanceUrl && apiToken && accountSecret) {
      const mensagemBoasVindas = `🎉 Bem-vindo ao Picotinho!
Agora você já pode usar o WhatsApp para consultar preços e organizar suas compras.
Vamos juntos reduzir seus custos e melhorar suas economias 🛒💰`;

      const sendUrl = `${instanceUrl}/token/${apiToken}/send-text`;
      
      console.log('📤 Enviando mensagem de boas-vindas');
      
      await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': accountSecret
        },
        body: JSON.stringify({
          phone: config.numero_whatsapp,
          message: mensagemBoasVindas
        })
      });
    }

    console.log('✅ Verificação concluída com sucesso');

    return new Response(JSON.stringify({
      success: true,
      message: 'Número verificado com sucesso!'
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