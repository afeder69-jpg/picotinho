import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendVerificationRequest {
  numeroWhatsApp: string
  nomeUsuario?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📱 Enviando código de verificação WhatsApp...')
    
    const { numeroWhatsApp, nomeUsuario }: SendVerificationRequest = await req.json()
    
    if (!numeroWhatsApp) {
      throw new Error('Número do WhatsApp é obrigatório')
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Gerar código de verificação de 6 dígitos
    const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString()
    
    // Buscar token da API do WhatsApp
    const whatsappToken = Deno.env.get('WHATSAPP_API_TOKEN')
    
    if (!whatsappToken) {
      console.error('❌ Token da API do WhatsApp não configurado')
      throw new Error('Token da API do WhatsApp não configurado')
    }

    console.log('🔑 Token configurado, comprimento:', whatsappToken.length)

    // Formatar número para envio (assumindo formato brasileiro)
    const numeroFormatado = formatPhoneNumber(numeroWhatsApp)
    
    // Mensagem com código de verificação
    const mensagemVerificacao = `🔐 Picotinho - Código de Verificação

Olá${nomeUsuario ? `, ${nomeUsuario}` : ''}!

Seu código de verificação é: *${codigoVerificacao}*

Por favor, digite este código no aplicativo para confirmar seu número do WhatsApp.

⏱️ Este código expira em 10 minutos.`

    // Enviar mensagem via Z-API (ou adaptável para outros provedores)
    const sucesso = await enviarMensagemWhatsApp(numeroFormatado, mensagemVerificacao, whatsappToken)
    
    if (sucesso) {
      // Salvar código na base de dados
      const { error: dbError } = await supabase
        .from('whatsapp_configuracoes')
        .update({ 
          codigo_verificacao: codigoVerificacao,
          data_codigo: new Date().toISOString(),
          verificado: false
        })
        .eq('numero_whatsapp', numeroWhatsApp)
        
      if (dbError) {
        console.error('❌ Erro ao salvar código no banco:', dbError)
        throw new Error('Erro ao salvar código de verificação')
      }
        
      console.log('✅ Código de verificação enviado com sucesso')
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Código de verificação enviado com sucesso'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      throw new Error('Falha ao enviar código de verificação')
    }

  } catch (error) {
    console.error('❌ Erro completo ao enviar código de verificação:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause
    })
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.name
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

/**
 * Envia mensagem via WhatsApp API (Z-API como exemplo)
 */
async function enviarMensagemWhatsApp(numeroDestino: string, mensagem: string, token: string): Promise<boolean> {
  try {
    console.log('📤 Iniciando envio para:', numeroDestino)
    console.log('🔑 Token (primeiros 10 chars):', token.substring(0, 10))
    
    // Verificar se o token tem formato correto (deve ter pelo menos 10 caracteres)
    if (!token || token.length < 10) {
      console.error('❌ Token inválido - muito curto:', token.length)
      return false
    }

    // Para Z-API - versão simplificada
    const apiUrl = `https://api.z-api.io/instances/${token}/token/send-text`
    
    const payload = {
      phone: numeroDestino,
      message: mensagem
    }

    console.log('🌐 URL da API:', apiUrl)
    console.log('📋 Payload:', JSON.stringify(payload, null, 2))
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })

    console.log('📊 Status da resposta:', response.status)
    const result = await response.json()
    console.log('📋 Resposta completa:', JSON.stringify(result, null, 2))

    if (response.ok) {
      console.log('✅ Mensagem enviada com sucesso!')
      return true
    } else {
      console.error('❌ Erro na API do WhatsApp:', result)
      return false
    }

  } catch (error) {
    console.error('❌ Erro crítico ao chamar API do WhatsApp:', {
      message: error.message,
      stack: error.stack
    })
    return false
  }
}

/**
 * Formata número de telefone para padrão internacional
 */
function formatPhoneNumber(numero: string): string {
  // Remove todos os caracteres não numéricos
  let cleaned = numero.replace(/\D/g, '')
  
  // Se não tem código do país, adiciona o do Brasil (55)
  if (cleaned.length === 11 && !cleaned.startsWith('55')) {
    cleaned = '55' + cleaned
  }
  
  return cleaned
}