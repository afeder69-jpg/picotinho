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
    console.log('🧪 TESTE WEBHOOK INICIADO')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Simular dados do Z-API
    const testData = {
      phone: "21970016024",
      message: {
        conversation: "Picotinho, baixa do estoque 1kg de banana",
        messageType: "text"
      },
      timestamp: Date.now()
    }

    console.log('📤 Enviando dados de teste para webhook...')
    console.log('🔗 URL do webhook:', `${supabaseUrl}/functions/v1/whatsapp-webhook`)

    // Chamar o webhook WhatsApp
    const webhookResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceRoleKey}`
      },
      body: JSON.stringify(testData)
    })

    const webhookResult = await webhookResponse.text()
    
    console.log('📋 Status do webhook:', webhookResponse.status)
    console.log('📋 Resposta do webhook:', webhookResult)

    // Verificar se mensagem foi salva
    const { data: mensagens, error } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)

    console.log('📊 Última mensagem salva:', mensagens)
    console.log('❌ Erro ao buscar mensagens:', error)

    return new Response(JSON.stringify({
      success: true,
      webhookStatus: webhookResponse.status,
      webhookResponse: webhookResult,
      lastMessage: mensagens?.[0] || null,
      error: error?.message || null
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro no teste:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})