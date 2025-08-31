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
    console.log('🧪 Testando conexão Z-API...')
    
    // Listar todas as variáveis de ambiente
    console.log('🔍 Variáveis de ambiente disponíveis:')
    const envVars = Deno.env.toObject()
    Object.keys(envVars).forEach(key => {
      if (key.includes('WHATSAPP') || key.includes('SUPABASE')) {
        // Mostrar também caracteres especiais
        const keyDisplay = JSON.stringify(key)
        console.log(`  ${keyDisplay}: ${envVars[key] ? 'DEFINIDA' : 'VAZIA'}`)
      }
    })
    
    // Tentar múltiplas variações dos nomes das variáveis
    let whatsappInstanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL') 
      || Deno.env.get('WHATSAPP_INSTANCE_URL\r\n')
      || Deno.env.get('WHATSAPP_INSTANCE_URL\n')
      || Deno.env.get('WHATSAPP_INSTANCE_URL ')
    
    let whatsappApiToken = Deno.env.get('WHATSAPP_API_TOKEN')
      || Deno.env.get('WHATSAPP_API_TOKEN\r\n') 
      || Deno.env.get('WHATSAPP_API_TOKEN\n')
      || Deno.env.get('WHATSAPP_API_TOKEN ')
    
    console.log('📋 Configurações encontradas:')
    console.log('  WHATSAPP_INSTANCE_URL:', whatsappInstanceUrl || 'NÃO ENCONTRADA')
    console.log('  WHATSAPP_API_TOKEN:', whatsappApiToken ? 'DEFINIDA' : 'NÃO ENCONTRADA')
    
    if (!whatsappInstanceUrl || !whatsappApiToken) {
      throw new Error('Configurações do Z-API não encontradas')
    }

    // Testar endpoint de status da instância
    const statusUrl = `${whatsappInstanceUrl}/status`
    console.log('🔍 Testando status da instância:', statusUrl)
    
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    })
    
    const statusResult = await statusResponse.json()
    console.log('📊 Status da instância:', statusResult)

    return new Response(JSON.stringify({
      success: true,
      message: 'Teste de conexão Z-API realizado',
      config: {
        instanceUrl: whatsappInstanceUrl,
        hasToken: !!whatsappApiToken
      },
      status: statusResult
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro no teste Z-API:', error)
    
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