import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 Testando envio direto via Z-API...')
    
    // Obter configurações das variáveis de ambiente
    const whatsappInstanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL')
    const whatsappApiToken = Deno.env.get('WHATSAPP_API_TOKEN')
    
    console.log('📋 Configurações:')
    console.log('  WHATSAPP_INSTANCE_URL:', whatsappInstanceUrl || 'NÃO ENCONTRADA')
    console.log('  WHATSAPP_API_TOKEN:', whatsappApiToken ? 'DEFINIDA' : 'NÃO ENCONTRADA')
    
    if (!whatsappInstanceUrl || !whatsappApiToken) {
      throw new Error('Configurações do Z-API não encontradas')
    }

    // Definir número de teste e mensagem
    const numeroTeste = '5521970016024'
    const mensagemTeste = 'Teste de envio via Z-API pelo Picotinho 🤖'
    
    // Montar URL da API (remover /send-text se já estiver na WHATSAPP_INSTANCE_URL)
    let apiUrl = whatsappInstanceUrl
    if (apiUrl.includes('/send-text')) {
      // Se a URL já tem /send-text, usar ela diretamente
      apiUrl = whatsappInstanceUrl
    } else {
      // Se não tem, adicionar /send-text
      apiUrl = `${whatsappInstanceUrl}/send-text`
    }
    console.log('🌐 URL da API:', apiUrl)
    
    // Fazer requisição para Z-API
    console.log('📤 Enviando mensagem de teste...')
    console.log('📱 Número:', numeroTeste)
    console.log('💬 Mensagem:', mensagemTeste)
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: numeroTeste,
        message: mensagemTeste
      })
    })
    
    const responseStatus = response.status
    const responseData = await response.json()
    
    console.log('📊 Status da resposta:', responseStatus)
    console.log('📋 Dados da resposta:', JSON.stringify(responseData, null, 2))

    return new Response(JSON.stringify({
      success: true,
      message: 'Teste de envio realizado',
      config: {
        instanceUrl: whatsappInstanceUrl,
        hasToken: !!whatsappApiToken,
        testPhone: numeroTeste,
        testMessage: mensagemTeste
      },
      apiResponse: {
        status: responseStatus,
        data: responseData
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro no teste de envio:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})