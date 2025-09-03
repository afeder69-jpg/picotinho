import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnviarCodigoRequest {
  numero_whatsapp: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verificar usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    const { numero_whatsapp }: EnviarCodigoRequest = await req.json();

    if (!numero_whatsapp || numero_whatsapp.length !== 13 || !numero_whatsapp.startsWith('55')) {
      throw new Error('Número do WhatsApp deve ter 13 dígitos e começar com 55');
    }

    // Remover o prefixo 55 para envio via API
    const numeroSemPrefixo = numero_whatsapp.startsWith('55') ? numero_whatsapp.substring(2) : numero_whatsapp;

    // Gerar código de verificação de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    
    console.log(`Gerando código ${codigo} para número ${numero_whatsapp} (enviando para ${numeroSemPrefixo})`);

    // Verificar se já existe uma configuração
    const { data: configExistente, error: configError } = await supabase
      .from('whatsapp_configuracoes')
      .select('*')
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (configError) {
      console.error('Erro ao verificar configuração existente:', configError);
      throw new Error('Erro ao verificar configuração');
    }

    // Se já tem uma configuração verificada e está tentando mudar número
    if (configExistente?.verificado && configExistente.numero_whatsapp !== numero_whatsapp) {
      // Salvar o código pendente SEM alterar o número ativo
      const { error: updateError } = await supabase
        .from('whatsapp_configuracoes')
        .update({
          codigo_verificacao: codigo,
          data_codigo: new Date().toISOString(),
          // NÃO atualizar numero_whatsapp aqui - só após verificação
          updated_at: new Date().toISOString()
        })
        .eq('usuario_id', user.id);

      if (updateError) {
        console.error('Erro ao salvar código para troca:', updateError);
        throw new Error('Erro ao salvar código de verificação');
      }

      // Salvar o número pendente em uma tabela separada ou campo temporário
      // Para simplificar, vamos usar um campo JSON para armazenar dados temporários
      const { error: tempError } = await supabase
        .from('whatsapp_configuracoes')
        .update({
          webhook_token: JSON.stringify({ numero_pendente: numero_whatsapp })
        })
        .eq('usuario_id', user.id);

    } else {
      // Primeira configuração ou mesmo número - pode fazer upsert normal
      const { error: updateError } = await supabase
        .from('whatsapp_configuracoes')
        .upsert({
          usuario_id: user.id,
          numero_whatsapp,
          codigo_verificacao: codigo,
          data_codigo: new Date().toISOString(),
          verificado: false,
          api_provider: 'z-api',
          webhook_token: '',
          ativo: true
        }, { onConflict: 'usuario_id' });

      if (updateError) {
        console.error('Erro ao salvar código:', updateError);
        throw new Error('Erro ao salvar código de verificação');
      }
    }


    // Enviar código via WhatsApp
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

    console.log('🔍 Verificando credenciais WhatsApp:');
    console.log('- WHATSAPP_INSTANCE_URL:', instanceUrl ? 'configurado' : 'não configurado');
    console.log('- WHATSAPP_API_TOKEN:', apiToken ? 'configurado (' + apiToken.substring(0, 8) + '...)' : 'não configurado');
    console.log('- WHATSAPP_ACCOUNT_SECRET:', accountSecret ? 'configurado' : 'não configurado');

    if (!instanceUrl || !apiToken) {
      console.error('❌ Credenciais WhatsApp não configuradas');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'WhatsApp não configurado. Configure WHATSAPP_INSTANCE_URL e WHATSAPP_API_TOKEN nas secrets do Supabase.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const mensagem = `🔐 *Código de Verificação Picotinho*\n\nSeu código de verificação é: *${codigo}*\n\nEste código expira em 10 minutos.\n\n_Não compartilhe este código com ninguém._`;

    // Usar EXATAMENTE a mesma estrutura que funciona no webhook
    const headers = {
      'Content-Type': 'application/json',
      'Client-Token': apiToken,
    };

    // SEMPRE adicionar Account-Secret (obrigatório para Z-API)
    if (accountSecret) {
      headers['Account-Secret'] = accountSecret;
    }

    console.log(`📱 Enviando código ${codigo} para número ${numeroSemPrefixo}`);
    console.log(`🔗 URL: ${instanceUrl}/token/${apiToken}/send-text`);
    console.log(`📋 Headers: Client-Token=${apiToken.substring(0, 8)}..., Account-Secret=${accountSecret ? 'configurado' : 'não configurado'}`);

    // Verificar se o Account-Secret é obrigatório
    if (!accountSecret) {
      console.error('❌ WHATSAPP_ACCOUNT_SECRET é obrigatório');
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Account Secret obrigatório. Use este código: ${codigo}`,
        codigo_debug: codigo,
        config_error: 'WHATSAPP_ACCOUNT_SECRET não configurado'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    try {
      const whatsappResponse = await fetch(`${instanceUrl}/token/${apiToken}/send-text`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: numeroSemPrefixo,
          message: mensagem,
        }),
      });

      const whatsappResult = await whatsappResponse.json();
      console.log('📊 Status da resposta WhatsApp:', whatsappResponse.status);
      console.log('📦 Resposta completa da Z-API:', JSON.stringify(whatsappResult));

      if (!whatsappResponse.ok) {
        console.error('❌ Erro ao enviar mensagem WhatsApp:', whatsappResult);
        // Se falhou, NUNCA mostrar o código - deve dar erro real
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Falha no envio WhatsApp: ${whatsappResult?.error || 'Erro desconhecido'}`,
          whatsapp_error: whatsappResult?.error || 'Erro desconhecido',
          whatsapp_status: whatsappResponse.status
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      console.log('✅ Código enviado com sucesso via WhatsApp!');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Código de verificação enviado com sucesso!'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    } catch (error) {
      console.error('💥 Erro na requisição para WhatsApp:', error);
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Erro na conexão com WhatsApp: ${error.message}. Use este código: ${codigo}`,
        codigo_debug: codigo,
        connection_error: error.message
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

  } catch (error) {
    console.error('Erro na função enviar-codigo-verificacao:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Erro interno do servidor' 
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);