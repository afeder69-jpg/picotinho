import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 TESTE DE SECRETS - WHATSAPP v2.0');
    console.log('🕐 Timestamp:', new Date().toISOString());
    console.log('🔄 Forçando reload dos secrets...');
    
    // Check ALL environment variables
    const allEnvs = Deno.env.toObject();
    console.log('🔍 TOTAL ENV VARS:', Object.keys(allEnvs).length);
    console.log('🔍 ENV KEYS:', JSON.stringify(Object.keys(allEnvs).sort(), null, 2));
    
    // Check specific secrets
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
    
    console.log('🔍 WHATSAPP_INSTANCE_URL:', instanceUrl ? 'EXISTS' : 'MISSING');
    console.log('🔍 WHATSAPP_API_TOKEN:', apiToken ? 'EXISTS' : 'MISSING');
    console.log('🔍 WHATSAPP_ACCOUNT_SECRET:', accountSecret ? 'EXISTS' : 'MISSING');
    
    if (instanceUrl) console.log('🔗 Instance URL valor:', instanceUrl);
    if (apiToken) console.log('🔑 API Token (8 chars):', apiToken.substring(0, 8) + '...');
    if (accountSecret) console.log('🔐 Account Secret (8 chars):', accountSecret.substring(0, 8) + '...');
    
    // Test a simple WhatsApp message
    if (instanceUrl && accountSecret) {
      const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;
      
      console.log('📤 TENTANDO ENVIAR MENSAGEM DE TESTE');
      console.log('🔗 URL:', sendTextUrl);
      
      const testMessage = {
        phone: '5521970016024',
        message: '✅ TESTE DE CONFIGURAÇÃO FUNCIONOU! ' + new Date().toLocaleTimeString('pt-BR')
      };
      
      console.log('📦 Payload:', JSON.stringify(testMessage, null, 2));
      
      const response = await fetch(sendTextUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': accountSecret
        },
        body: JSON.stringify(testMessage)
      });
      
      console.log('📊 Status HTTP:', response.status);
      const responseText = await response.text();
      console.log('📝 Resposta Z-API:', responseText);
      
      return new Response(JSON.stringify({
        success: true,
        status: response.status,
        response: responseText,
        secrets: {
          instanceUrl: instanceUrl ? 'EXISTS' : 'MISSING',
          apiToken: apiToken ? 'EXISTS' : 'MISSING',
          accountSecret: accountSecret ? 'EXISTS' : 'MISSING'
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Secrets faltando',
        secrets: {
          instanceUrl: instanceUrl ? 'EXISTS' : 'MISSING',
          apiToken: apiToken ? 'EXISTS' : 'MISSING',
          accountSecret: accountSecret ? 'EXISTS' : 'MISSING'
        },
        allEnvKeys: Object.keys(allEnvs).sort()
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
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