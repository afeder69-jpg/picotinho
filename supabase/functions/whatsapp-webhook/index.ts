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
    console.log('📋 Headers:', Object.fromEntries(req.headers.entries()))
    
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
      const body = await req.json()
      console.log('🔥 WEBHOOK PAYLOAD COMPLETO 🔥')
      console.log('====================================')
      console.log(JSON.stringify(body, null, 2))
      console.log('====================================')
      console.log('📊 Tipo do payload:', typeof body)
      console.log('📊 Chaves do payload:', Object.keys(body || {}))
      console.log('📋 Dados recebidos do webhook:', JSON.stringify(body, null, 2))

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

      // Implementar resposta automática do Picotinho
      let respostaEnviada = false
      if (processedMessage.comando_identificado) {
        console.log('🤖 Comando identificado:', processedMessage.comando_identificado)
        
        const resposta = await enviarRespostaPicotinho(
          processedMessage.remetente, 
          processedMessage.comando_identificado,
          processedMessage.parametros_comando
        )
        
        if (resposta.success) {
          console.log('✅ Resposta automática enviada:', resposta.message)
          respostaEnviada = true
          
          // Atualizar mensagem com resposta enviada
          await supabase
            .from('whatsapp_mensagens')
            .update({
              processada: true,
              resposta_enviada: resposta.message,
              data_processamento: new Date().toISOString()
            })
            .eq('id', mensagemSalva.id)
        } else {
          console.error('❌ Erro ao enviar resposta:', resposta.error)
        }
      } else {
        // Resposta padrão para mensagens sem comando específico
        const respostaDefault = await enviarRespostaPicotinho(
          processedMessage.remetente,
          'saudacao',
          { mensagem_original: processedMessage.conteudo }
        )
        
        if (respostaDefault.success) {
          console.log('✅ Resposta padrão enviada')
          respostaEnviada = true
        }
      }

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
    
    // Z-API Format v1 (formato atual nos logs)
    if (webhookData.phone && webhookData.text) {
      const message = webhookData.text.message || webhookData.text
      console.log('✅ Reconhecido como Z-API v1:', message)
      
      return {
        remetente: cleanPhoneNumber(webhookData.phone),
        conteudo: message,
        tipo_mensagem: webhookData.type || 'text',
        webhook_data: webhookData,
        ...identifyCommand(message)
      }
    }
    
    // Z-API Format v2 
    if (webhookData.phone && webhookData.message) {
      const message = webhookData.message
      console.log('✅ Reconhecido como Z-API v2:', message)
      
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
    console.log('📋 Dados não processados:', JSON.stringify(webhookData, null, 2))
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

/**
 * Envia resposta automática do Picotinho via Z-API
 */
async function enviarRespostaPicotinho(numeroDestino: string, comando: string, parametros?: any) {
  try {
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL')
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN')
    
    if (!instanceUrl || !apiToken) {
      console.error('❌ Configurações do Z-API não encontradas')
      return { success: false, error: 'Configurações não encontradas' }
    }
    
    // Gerar resposta baseada no comando
    let mensagemResposta = ''
    
    switch (comando) {
      case 'baixar_estoque':
        mensagemResposta = '🗂️ *Picotinho aqui!* 📊\n\nVou baixar seu estoque. Por favor, me envie as notas fiscais ou códigos QR que deseja processar!'
        break
      
      case 'consultar_estoque':
        mensagemResposta = '📋 *Picotinho aqui!* 📊\n\nVou consultar seu estoque atual. Um momento...\n\n_(Esta funcionalidade está sendo desenvolvida)_'
        break
      
      case 'adicionar_produto':
        mensagemResposta = '➕ *Picotinho aqui!* 📦\n\nVou te ajudar a adicionar produtos ao estoque. Por favor, me informe:\n• Nome do produto\n• Quantidade\n• Preço (opcional)'
        break
      
      case 'saudacao':
      default:
        mensagemResposta = '👋 *Olá! Sou o Picotinho!* 🤖\n\nSou seu assistente para controle de estoque. Posso te ajudar com:\n\n📊 Consultar estoque\n📥 Baixar produtos\n➕ Adicionar itens\n\nDigite "Picotinho" seguido do que deseja fazer!'
        break
    }
    
    console.log('📤 Enviando resposta para:', numeroDestino)
    console.log('💬 Mensagem:', mensagemResposta)
    
    // Enviar mensagem via Z-API
    const response = await fetch(`${instanceUrl}/token/${apiToken}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: numeroDestino,
        message: mensagemResposta
      })
    })
    
    const responseData = await response.json()
    console.log('🌐 Resposta da Z-API:', responseData)
    
    if (response.ok && !responseData.error) {
      return { 
        success: true, 
        message: mensagemResposta,
        apiResponse: responseData 
      }
    } else {
      console.error('❌ Erro na resposta da Z-API:', responseData)
      return { 
        success: false, 
        error: responseData.error || 'Erro ao enviar mensagem' 
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao enviar resposta:', error)
    return { 
      success: false, 
      error: error.message 
    }
  }
}