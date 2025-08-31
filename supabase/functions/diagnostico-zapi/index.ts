import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 === DIAGNÓSTICO Z-API INICIADO ===')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const whatsappToken = Deno.env.get('WHATSAPP_API_TOKEN')!
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL')!
    
    console.log('🔧 Variáveis de ambiente:')
    console.log('- SUPABASE_URL:', supabaseUrl ? '✅' : '❌')
    console.log('- WHATSAPP_API_TOKEN:', whatsappToken ? '✅' : '❌')
    console.log('- WHATSAPP_INSTANCE_URL:', instanceUrl ? '✅' : '❌')
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 1. Testar webhook diretamente
    console.log('📤 1. Testando webhook diretamente...')
    const testWebhookData = {
      phone: "21970016024",
      message: {
        conversation: "Picotinho, baixa do estoque 1kg de banana - TESTE DIAGNÓSTICO",
        messageType: "text"
      },
      timestamp: Date.now()
    }

    const webhookResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceRoleKey}`
      },
      body: JSON.stringify(testWebhookData)
    })

    const webhookResult = await webhookResponse.text()
    console.log('📋 Resultado webhook:', webhookResponse.status, webhookResult)

    // 2. Verificar configuração do usuário
    console.log('📊 2. Verificando configuração WhatsApp...')
    const { data: config, error: configError } = await supabase
      .from('whatsapp_configuracoes')
      .select('*')
      .eq('numero_whatsapp', '21970016024')
      .maybeSingle()

    console.log('⚙️ Configuração encontrada:', config)
    console.log('❌ Erro na configuração:', configError)

    // 3. Verificar mensagens recentes
    console.log('💬 3. Verificando mensagens recentes...')
    const { data: mensagens, error: msgError } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    console.log('📨 Mensagens encontradas:', mensagens?.length || 0)
    console.log('❌ Erro nas mensagens:', msgError)

    // 4. Testar Z-API se configurado
    let zapiTest = null
    if (instanceUrl && whatsappToken) {
      try {
        console.log('📱 4. Testando conexão Z-API...')
        const zapiResponse = await fetch(`${instanceUrl}/status`, {
          method: 'GET',
          headers: {
            'Client-Token': whatsappToken
          }
        })
        
        zapiTest = {
          status: zapiResponse.status,
          ok: zapiResponse.ok,
          url: instanceUrl
        }
        
        if (zapiResponse.ok) {
          const zapiData = await zapiResponse.json()
          zapiTest.data = zapiData
        }
      } catch (error) {
        zapiTest = { error: error.message }
      }
    }

    console.log('🔌 Teste Z-API:', zapiTest)

    return new Response(JSON.stringify({
      success: true,
      diagnostico: {
        webhook: {
          status: webhookResponse.status,
          response: webhookResult
        },
        configuracao: config,
        mensagens_recentes: mensagens?.length || 0,
        zapi_teste: zapiTest,
        orientacoes: {
          webhook_url: `${supabaseUrl}/functions/v1/whatsapp-webhook`,
          numero_origem: "21970016024",
          numero_destino: "21979397111",
          comando_teste: "Picotinho, baixa do estoque 1kg de banana"
        }
      }
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro no diagnóstico:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})