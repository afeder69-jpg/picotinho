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
    console.log('🔧 DIAGNÓSTICO Z-API - Verificando configuração...')
    
    const whatsappToken = Deno.env.get('WHATSAPP_API_TOKEN')
    const whatsappInstanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL')
    
    const diagnostico = {
      timestamp: new Date().toISOString(),
      token_configurado: !!whatsappToken,
      url_configurada: !!whatsappInstanceUrl,
      token_preview: whatsappToken ? whatsappToken.substring(0, 10) + '...' : 'NÃO CONFIGURADO',
      url_completa: whatsappInstanceUrl || 'NÃO CONFIGURADA',
      status_geral: 'VERIFICANDO...'
    }
    
    console.log('📋 Diagnóstico inicial:', JSON.stringify(diagnostico, null, 2))
    
    if (!whatsappToken || !whatsappInstanceUrl) {
      diagnostico.status_geral = 'ERRO - Configuração incompleta'
      return new Response(JSON.stringify({
        success: false,
        error: 'Token ou URL da instância Z-API não configurados',
        diagnostico
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Testar conexão com Z-API
    console.log('🌐 Testando conexão com Z-API...')
    const apiUrl = `${whatsappInstanceUrl}/status`
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': whatsappToken
      }
    })
    
    const result = await response.json()
    console.log('📡 Resposta Z-API Status:', result)
    
    const conexaoOk = response.ok
    diagnostico.status_geral = conexaoOk ? 'FUNCIONANDO' : 'ERRO NA CONEXÃO'
    
    // Testar envio de mensagem para número de teste
    let testeEnvio = null
    if (conexaoOk) {
      console.log('📱 Testando envio para número de teste...')
      try {
        const numeroTeste = '5521970016024' // Seu número de teste
        const mensagemTeste = 'Teste de configuração Z-API - Picotinho'
        
        const envioUrl = `${whatsappInstanceUrl}/send-text`
        const envioResponse = await fetch(envioUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': whatsappToken
          },
          body: JSON.stringify({
            phone: numeroTeste,
            message: mensagemTeste
          })
        })
        
        const envioResult = await envioResponse.json()
        console.log('📬 Resultado teste de envio:', envioResult)
        
        testeEnvio = {
          sucesso: envioResponse.ok,
          resposta: envioResult,
          numero_testado: numeroTeste
        }
      } catch (error) {
        console.error('❌ Erro no teste de envio:', error)
        testeEnvio = {
          sucesso: false,
          erro: error.message
        }
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Diagnóstico Z-API concluído',
      diagnostico: {
        ...diagnostico,
        conexao_ok: conexaoOk,
        resposta_status: result,
        teste_envio: testeEnvio
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('💥 Erro no diagnóstico Z-API:', error)
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