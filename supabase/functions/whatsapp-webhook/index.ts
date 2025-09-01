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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📱 WhatsApp Webhook recebido:', req.method)
    console.log('🌐 URL completa:', req.url)
    
    // Mostrar headers para debug
    const headers = Object.fromEntries(req.headers.entries())
    console.log('📋 Headers:', JSON.stringify(headers, null, 2))
    
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
          headers: corsHeaders 
        })
      }
      
      return new Response('Webhook verification failed', { 
        status: 400,
        headers: corsHeaders 
      })
    }

    if (req.method === 'POST') {
      // Log do payload completo para debug
      const requestBody = await req.text()
      const webhookData = JSON.parse(requestBody)
      
      console.log('====================================')
      console.log('🔥 WEBHOOK PAYLOAD COMPLETO 🔥')
      console.log(JSON.stringify(webhookData, null, 2))
      console.log('====================================')
      
      // Debug da estrutura dos dados
      console.log('📊 Tipo do payload:', typeof webhookData)
      console.log('📊 Chaves do payload:', Object.keys(webhookData))
      
      console.log('📋 Dados recebidos do webhook:', JSON.stringify(webhookData, null, 2))
      
      // Processar mensagem baseado no provedor
      const processedMessage = await processWhatsAppMessage(webhookData)
      
      if (!processedMessage) {
        console.log('⚠️ Mensagem não processada ou formato não reconhecido')
        return new Response('Formato não reconhecido', { 
          status: 400,
          headers: corsHeaders 
        })
      }

      console.log('✅ Mensagem processada:', JSON.stringify(processedMessage, null, 2))

      // Buscar usuário baseado no número do WhatsApp
      console.log('🔍 Buscando usuário para número:', processedMessage.remetente)
      const usuario = await buscarUsuarioPorWhatsApp(supabase, processedMessage.remetente)
      console.log('👤 Usuário encontrado:', usuario)
      
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
    console.log('📊 Estrutura dos dados recebidos:', Object.keys(webhookData))
    
    // Z-API Format v1 (mais comum)
    if (webhookData.phone && webhookData.text) {
      console.log('✅ Reconhecido como Z-API v1:', webhookData.text.message)
      
      return {
        remetente: cleanPhoneNumber(webhookData.phone),
        conteudo: webhookData.text.message || '',
        tipo_mensagem: webhookData.type || 'text',
        webhook_data: webhookData,
        ...identifyCommand(webhookData.text.message || '')
      }
    }
    
    // Z-API Format v2 (alternativo)
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
      console.log('✅ Reconhecido como Twilio:', webhookData.Body)
      
      return {
        remetente: cleanPhoneNumber(webhookData.From),
        conteudo: webhookData.Body,
        tipo_mensagem: 'text',
        webhook_data: webhookData,
        ...identifyCommand(webhookData.Body)
      }
    }
    
    // Meta WhatsApp Cloud API Format
    if (webhookData.entry && Array.isArray(webhookData.entry)) {
      for (const entry of webhookData.entry) {
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.value && change.value.messages && Array.isArray(change.value.messages)) {
              const message = change.value.messages[0]
              const contact = change.value.contacts?.[0]
              
              console.log('✅ Reconhecido como Meta Cloud API:', message.text?.body)
              
              return {
                remetente: cleanPhoneNumber(contact?.wa_id || message.from),
                conteudo: message.text?.body || message.caption || '',
                tipo_mensagem: message.type || 'text',
                webhook_data: webhookData,
                ...identifyCommand(message.text?.body || message.caption || '')
              }
            }
          }
        }
      }
    }
    
    console.log('❌ Formato não reconhecido')
    return null
    
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error)
    return null
  }
}

/**
 * Identifica comandos básicos do Picotinho
 */
function identifyCommand(texto: string): { comando_identificado?: string, parametros_comando?: any } {
  if (!texto || typeof texto !== 'string') {
    return {}
  }
  
  const textoLower = texto.toLowerCase().trim()
  
  // Comandos do Picotinho
  if (textoLower.includes('picotinho') || textoLower.includes('pacotinho')) {
    console.log('🤖 Comando identificado: baixar_estoque')
    
    if (textoLower.includes('baixa') || textoLower.includes('reduz') || textoLower.includes('retira')) {
      return {
        comando_identificado: 'baixar_estoque',
        parametros_comando: { texto_original: texto }
      }
    }
    
    if (textoLower.includes('consulta') || textoLower.includes('verifica') || textoLower.includes('quanto')) {
      return {
        comando_identificado: 'consultar_estoque',
        parametros_comando: { texto_original: texto }
      }
    }
    
    if (textoLower.includes('adiciona') || textoLower.includes('inclui') || textoLower.includes('lista')) {
      return {
        comando_identificado: 'adicionar_produto',
        parametros_comando: { texto_original: texto }
      }
    }
  }
  
  return {}
}

/**
 * Limpa e padroniza número de telefone
 */
function cleanPhoneNumber(phone: string): string {
  if (!phone) return ''
  
  // Remove todos os caracteres não numéricos
  let cleaned = phone.replace(/\D/g, '')
  
  // Se começa com 55 (código do Brasil), remove
  if (cleaned.startsWith('55') && cleaned.length > 11) {
    cleaned = cleaned.substring(2)
  }
  
  // Se tem 11 dígitos e o segundo dígito é 9 (celular), está correto
  if (cleaned.length === 11 && cleaned[2] === '9') {
    return cleaned
  }
  
  // Se tem 10 dígitos, adiciona o 9 do celular
  if (cleaned.length === 10) {
    return cleaned.substring(0, 2) + '9' + cleaned.substring(2)
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