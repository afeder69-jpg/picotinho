import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🚀 WhatsApp Webhook - Início');
  console.log('📱 Método:', req.method);

  try {
    if (req.method === 'GET') {
      // Verificação do webhook
      const url = new URL(req.url);
      const challenge = url.searchParams.get('hub.challenge');
      if (challenge) {
        console.log('✅ Webhook verificado com sucesso');
        return new Response(challenge, { 
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
        });
      }
    }

    if (req.method === 'POST') {
      const webhookData = await req.json();
      console.log('📨 Dados recebidos:', JSON.stringify(webhookData, null, 2));

      // Verificar se é uma mensagem recebida
      if (webhookData.type === 'ReceivedCallback' && !webhookData.fromMe) {
        const numeroRemetente = webhookData.phone;
        const mensagem = webhookData.text?.message;

        console.log('📞 Número:', numeroRemetente);
        console.log('💬 Mensagem:', mensagem);

        // Enviar resposta automática
        await enviarRespostaAutomatica(numeroRemetente);
        
        console.log('✅ Resposta automática enviada com sucesso');
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Webhook processado' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Método não suportado' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    );

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
}

async function enviarRespostaAutomatica(numeroDestino: string): Promise<void> {
  const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
  const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');

  console.log('🔧 Verificando configuração...');
  console.log('🔗 Instance URL existe?', !!instanceUrl);
  console.log('🔑 API Token existe?', !!apiToken);

  if (!instanceUrl || !apiToken) {
    throw new Error('Configuração do WhatsApp não encontrada');
  }

  const url = `${instanceUrl}/send-text`;
  const payload = {
    phone: numeroDestino,
    message: "Mensagem recebida ✅"
  };

  console.log('📤 Enviando para:', url);
  console.log('📤 Dados:', JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': apiToken
    },
    body: JSON.stringify(payload)
  });

  const result = await response.text();
  console.log('📤 Status resposta:', response.status);
  console.log('📤 Resposta API:', result);

  if (!response.ok) {
    throw new Error(`Erro ao enviar mensagem: ${response.status} - ${result}`);
  }
}

serve(handler);