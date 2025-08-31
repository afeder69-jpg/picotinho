import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

// Headers CORS para permitir requests do WhatsApp
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WhatsAppMessage {
  from: string // Número do remetente
  body: string // Conteúdo da mensagem
  type: string // Tipo: text, image, audio, etc.
  timestamp?: number
  messageId?: string
}

interface ProcessedMessage {
  remetente: string
  conteudo: string
  tipo_mensagem: string
  webhook_data: any
  comando_identificado?: string
  parametros_comando?: any
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('🔧 OPTIONS request recebido - CORS preflight')
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 ====== WEBHOOK WHATSAPP INICIADO ======')
    console.log('📱 Método:', req.method)
    console.log('🔗 URL completa:', req.url)
    console.log('📋 Headers recebidos:', Object.fromEntries(req.headers.entries()))
    console.log('🕐 Timestamp:', new Date().toISOString())
    console.log('===============================================')
    
    // Inicializar cliente Supabase com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    if (req.method === 'GET') {
      // Webhook verification (para Z-API, Twilio, etc.)
      const url = new URL(req.url)
      const hubChallenge = url.searchParams.get('hub.challenge')
      const hubVerifyToken = url.searchParams.get('hub.verify_token')
      
      console.log('🔍 Verificação de webhook:', { hubChallenge, hubVerifyToken })
      
      if (hubChallenge && hubVerifyToken) {
        // Verificar token se necessário
        return new Response(hubChallenge, { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        })
      }
      
      return new Response('WhatsApp Webhook ativo', { 
        status: 200,
        headers: corsHeaders 
      })
    }

    if (req.method === 'POST') {
      console.log('📨 POST request recebido')
      const body = await req.json()
      console.log('📋 BODY COMPLETO:', JSON.stringify(body, null, 2))
      console.log('📋 Tipo do body:', typeof body)
      console.log('📋 Keys do body:', Object.keys(body || {}))

      // Processar mensagem baseado no provedor
      const processedMessage = await processWhatsAppMessage(body)
      
      if (!processedMessage) {
        console.log('❌ Mensagem não processável')
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Mensagem não processável' 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      console.log('✅ Mensagem processada:', processedMessage)

      // Buscar usuário baseado no número do WhatsApp
      const usuario = await buscarUsuarioPorWhatsApp(supabase, processedMessage.remetente)
      
      // Salvar mensagem no banco
      const { data: mensagemSalva, error: erroSalvar } = await supabase
        .from('whatsapp_mensagens')
        .insert({
          usuario_id: usuario?.usuario_id || null,
          remetente: processedMessage.remetente,
          conteudo: processedMessage.conteudo,
          tipo_mensagem: processedMessage.tipo_mensagem,
          webhook_data: processedMessage.webhook_data,
          comando_identificado: processedMessage.comando_identificado,
          parametros_comando: processedMessage.parametros_comando,
          data_recebimento: new Date().toISOString()
        })
        .select()
        .single()

      if (erroSalvar) {
        console.error('❌ Erro ao salvar mensagem:', erroSalvar)
        throw erroSalvar
      }

      console.log('💾 Mensagem salva no banco:', mensagemSalva.id)

      // Resposta de sucesso
      return new Response(JSON.stringify({
        success: true,
        message: 'Mensagem recebida e salva',
        messageId: mensagemSalva.id
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response('Método não permitido', { 
      status: 405,
      headers: corsHeaders 
    })

  } catch (error) {
    console.error('❌ Erro no webhook WhatsApp:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

/**
 * Processa mensagem do WhatsApp baseado no provedor de API
 */
async function processWhatsAppMessage(webhookData: any): Promise<ProcessedMessage | null> {
  try {
    console.log('🔄 Processando mensagem do webhook...')
    
    // Z-API Format
    if (webhookData.phone && webhookData.message) {
      const message = webhookData.message
      
      return {
        remetente: cleanPhoneNumber(webhookData.phone),
        conteudo: message.conversation || message.text || message.caption || '',
        tipo_mensagem: message.messageType || 'text',
        webhook_data: webhookData,
        ...identifyCommand(message.conversation || message.text || message.caption || '')
      }
    }
    
    // Twilio Format
    if (webhookData.From && webhookData.Body) {
      return {
        remetente: cleanPhoneNumber(webhookData.From),
        conteudo: webhookData.Body,
        tipo_mensagem: 'text',
        webhook_data: webhookData,
        ...identifyCommand(webhookData.Body)
      }
    }
    
    // Meta WhatsApp Cloud API Format
    if (webhookData.entry && webhookData.entry[0]?.changes) {
      const change = webhookData.entry[0].changes[0]
      if (change.value?.messages && change.value.messages[0]) {
        const message = change.value.messages[0]
        
        return {
          remetente: cleanPhoneNumber(message.from),
          conteudo: message.text?.body || message.caption || '',
          tipo_mensagem: message.type || 'text',
          webhook_data: webhookData,
          ...identifyCommand(message.text?.body || message.caption || '')
        }
      }
    }
    
    console.log('❌ Formato de webhook não reconhecido')
    return null
    
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error)
    return null
  }
}

/**
 * Identifica comandos na mensagem (para futuras implementações)
 */
function identifyCommand(texto: string): { comando_identificado?: string, parametros_comando?: any } {
  if (!texto) return {}
  
  const textoLimpo = texto.toLowerCase().trim()
  
  // Detectar comandos básicos do Picotinho
  if (textoLimpo.includes('picotinho')) {
    if (textoLimpo.includes('baixa') || textoLimpo.includes('baixar')) {
      return {
        comando_identificado: 'baixar_estoque',
        parametros_comando: { texto_original: texto }
      }
    }
    
    if (textoLimpo.includes('consulta') || textoLimpo.includes('ver') || textoLimpo.includes('mostrar')) {
      return {
        comando_identificado: 'consultar_estoque',
        parametros_comando: { texto_original: texto }
      }
    }
    
    if (textoLimpo.includes('adiciona') || textoLimpo.includes('inserir') || textoLimpo.includes('cadastrar')) {
      return {
        comando_identificado: 'adicionar_produto',
        parametros_comando: { texto_original: texto }
      }
    }
  }
  
  return {}
}

/**
 * Limpa e normaliza número de telefone
 */
function cleanPhoneNumber(phone: string): string {
  // Remove todos os caracteres não numéricos
  let cleaned = phone.replace(/\D/g, '')
  
  // Remove código do país se presente (55 para Brasil)
  if (cleaned.startsWith('55') && cleaned.length > 11) {
    cleaned = cleaned.substring(2)
  }
  
  // Adiciona 9 se for celular sem
  if (cleaned.length === 10 && !cleaned.startsWith('9')) {
    cleaned = cleaned.substring(0, 2) + '9' + cleaned.substring(2)
  }
  
  return cleaned
}

/**
 * Busca usuário baseado no número do WhatsApp
 */
async function buscarUsuarioPorWhatsApp(supabase: any, numeroWhatsApp: string) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_configuracoes')
      .select('usuario_id')
      .eq('numero_whatsapp', numeroWhatsApp)
      .eq('ativo', true)
      .maybeSingle()
    
    if (error) {
      console.error('❌ Erro ao buscar usuário:', error)
      return null
    }
    
    return data
  } catch (error) {
    console.error('❌ Erro na busca do usuário:', error)
    return null
  }
}