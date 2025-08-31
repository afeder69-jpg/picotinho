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
    console.log('📱 Enviando código de verificação WhatsApp...')
    
    const { numero_whatsapp, usuario_id } = await req.json()
    
    if (!numero_whatsapp || !usuario_id) {
      throw new Error('Número do WhatsApp e usuário são obrigatórios')
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Gerar código de verificação de 6 dígitos
    const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString()
    
    console.log('🔐 Código gerado:', codigoVerificacao)

    // Salvar código na configuração do usuário
    const { error: saveError } = await supabase
      .from('whatsapp_configuracoes')
      .upsert({
        usuario_id,
        numero_whatsapp,
        codigo_verificacao: codigoVerificacao,
        data_codigo: new Date().toISOString(),
        verificado: false,
        ativo: false,
        api_provider: 'z-api'
      }, { onConflict: 'usuario_id' })

    if (saveError) {
      console.error('❌ Erro ao salvar código:', saveError)
      throw saveError
    }

    // Debug: Listar todas as variáveis de ambiente disponíveis
    console.log('🔍 Listando todas as variáveis de ambiente:')
    for (const [key, value] of Object.entries(Deno.env.toObject())) {
      if (key.includes('WHATSAPP')) {
        console.log(`  ${key}: ${value ? 'DEFINIDA' : 'VAZIA'}`)
      }
    }

    // Tentar múltiplas variações dos nomes das variáveis (incluindo com caracteres especiais)
    let whatsappInstanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL') 
      || Deno.env.get('WHATSAPP_INSTANCE_URL\r\n')
      || Deno.env.get('WHATSAPP_INSTANCE_URL\n')
      || Deno.env.get('WHATSAPP_INSTANCE_URL ')
    
    let whatsappApiToken = Deno.env.get('WHATSAPP_API_TOKEN')
      || Deno.env.get('WHATSAPP_API_TOKEN\r\n') 
      || Deno.env.get('WHATSAPP_API_TOKEN\n')
      || Deno.env.get('WHATSAPP_API_TOKEN ')
    
    console.log('🔧 Tentando acessar variáveis Z-API...')
    console.log('🔧 WHATSAPP_INSTANCE_URL:', whatsappInstanceUrl || 'NÃO ENCONTRADA')
    console.log('🔧 WHATSAPP_API_TOKEN:', whatsappApiToken ? 'DEFINIDA' : 'NÃO ENCONTRADA')
    
    if (!whatsappInstanceUrl) {
      console.error('❌ WHATSAPP_INSTANCE_URL não encontrada')
      throw new Error('Variável WHATSAPP_INSTANCE_URL não configurada. Verifique os secrets do Supabase.')
    }
    
    if (!whatsappApiToken) {
      console.error('❌ WHATSAPP_API_TOKEN não encontrada')  
      throw new Error('Variável WHATSAPP_API_TOKEN não configurada. Verifique os secrets do Supabase.')
    }

    console.log('✅ Configuração Z-API carregada com sucesso')

    // Montar URL para envio de mensagem (verificar se já tem token na URL)
    const sendMessageUrl = whatsappInstanceUrl.includes('/token/') 
      ? `${whatsappInstanceUrl}/send-text`
      : `${whatsappInstanceUrl}/token/${whatsappApiToken}/send-text`
    
    // Formatar número no padrão internacional sem símbolos
    const numeroFormatado = numero_whatsapp.replace(/\D/g, '')
    
    const mensagem = `🤖 *Picotinho* - Código de verificação:\n\n*${codigoVerificacao}*\n\nDigite este código no aplicativo para confirmar seu número do WhatsApp.`

    console.log('📤 Enviando para URL:', sendMessageUrl)
    console.log('📤 Número formatado:', numeroFormatado)

    // Enviar mensagem via Z-API
    const zapiResponse = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': whatsappApiToken,
      },
      body: JSON.stringify({
        phone: numeroFormatado,
        message: mensagem
      })
    })

    const zapiResult = await zapiResponse.json()
    
    console.log('📤 Resposta Z-API:', zapiResult)

    if (!zapiResponse.ok) {
      console.error('❌ Erro no Z-API:', zapiResult)
      throw new Error(`Erro ao enviar mensagem via Z-API: ${zapiResult.message || 'Erro desconhecido'}`)
    }

    console.log('✅ Código enviado com sucesso para:', numero_whatsapp)

    return new Response(JSON.stringify({
      success: true,
      message: 'Código de verificação enviado com sucesso',
      numero: numero_whatsapp
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro ao enviar código:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})