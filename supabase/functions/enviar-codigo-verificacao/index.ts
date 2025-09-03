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

    // Gerar código de verificação de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    
    console.log(`Gerando código ${codigo} para número ${numero_whatsapp}`);

    // Salvar código na configuração do usuário
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

    // Enviar código via WhatsApp
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');

    if (!instanceUrl || !apiToken) {
      console.error('Credenciais WhatsApp não configuradas');
      // Em produção, aqui enviaria por SMS ou outro método
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Código gerado. Em ambiente de desenvolvimento, o código é: ' + codigo,
        codigo_debug: codigo // Remover em produção
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const mensagem = `🔐 *Código de Verificação Picotinho*\n\nSeu código de verificação é: *${codigo}*\n\nEste código expira em 10 minutos.\n\n_Não compartilhe este código com ninguém._`;

    const whatsappResponse = await fetch(`${instanceUrl}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': apiToken,
      },
      body: JSON.stringify({
        phone: numero_whatsapp,
        message: mensagem,
      }),
    });

    const whatsappResult = await whatsappResponse.json();
    console.log('Resposta WhatsApp:', whatsappResult);

    if (!whatsappResponse.ok) {
      console.error('Erro ao enviar mensagem WhatsApp:', whatsappResult);
      throw new Error('Erro ao enviar código por WhatsApp');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Código de verificação enviado com sucesso!'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

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