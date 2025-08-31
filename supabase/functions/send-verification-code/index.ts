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
    console.log('📱 INÍCIO: Processando envio de código')
    
    const { numeroWhatsApp, nomeUsuario }: SendVerificationRequest = await req.json()
    console.log('📞 Número recebido:', numeroWhatsApp)
    
    if (!numeroWhatsApp) {
      console.log('❌ Número não fornecido')
      throw new Error('Número do WhatsApp é obrigatório')
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('❌ Variáveis de ambiente Supabase não configuradas')
      throw new Error('Configuração do Supabase incompleta')
    }
    
    console.log('🔧 Criando cliente Supabase...')
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Gerar código de verificação de 6 dígitos
    const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString()
    console.log('🔢 Código gerado:', codigoVerificacao)
    
    // Salvar código no banco de dados
    console.log('💾 Salvando código no banco de dados...')
    
    const { error: dbError } = await supabase
      .from('whatsapp_configuracoes')
      .update({
        codigo_verificacao: codigoVerificacao,
        data_codigo: new Date().toISOString(),
        verificado: false
      })
      .eq('numero_whatsapp', numeroWhatsApp)

    if (dbError) {
      console.error('❌ Erro ao salvar código:', dbError)
      throw new Error('Erro interno ao salvar código')
    }

    console.log('✅ Código salvo com sucesso')

    // Enviar código via WhatsApp
    console.log('📱 Tentando enviar código via WhatsApp...')
    const enviadoWhatsApp = await enviarCodigoWhatsApp(numeroWhatsApp, codigoVerificacao, nomeUsuario)
    
    if (enviadoWhatsApp) {
      console.log('✅ Código enviado com sucesso via WhatsApp')
      return new Response(JSON.stringify({
        success: true,
        message: 'Código enviado com sucesso para seu WhatsApp',
        enviado_whatsapp: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      console.log('⚠️ Falha no envio via WhatsApp, mas código foi salvo')
      return new Response(JSON.stringify({
        success: true,
        message: 'Código salvo - verifique configuração Z-API',
        enviado_whatsapp: false,
        debug_info: 'Falha no envio Z-API - verifique configuração'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('❌ Erro geral:', error)
    return new Response(JSON.stringify({
      success: false,
      message: error.message || 'Erro interno do servidor',
      error: error.message || 'Erro desconhecido',
      type: error.name || 'Error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

/**
 * Envia código de verificação via WhatsApp usando Z-API
 */
async function enviarCodigoWhatsApp(numeroWhatsApp: string, codigo: string, nomeUsuario?: string): Promise<boolean> {
  try {
    const whatsappToken = Deno.env.get('WHATSAPP_API_TOKEN')
    const whatsappInstanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL')
    
    if (!whatsappToken || !whatsappInstanceUrl) {
      console.log('⚠️ Token ou URL da instância Z-API não configurados')
      console.log('Token existe:', !!whatsappToken)
      console.log('URL existe:', !!whatsappInstanceUrl)
      return false
    }

    const numeroFormatado = formatPhoneNumber(numeroWhatsApp)
    const nome = nomeUsuario || 'usuário'
    
    const mensagem = `🔐 *Código de Verificação Picotinho*

Olá ${nome}! 

Seu código de verificação é: *${codigo}*

⏱️ Este código expira em 10 minutos.

Digite este código no app para confirmar seu WhatsApp.

---
Picotinho 🛒`

    // URL correta baseada no formato que você forneceu
    const apiUrl = `${whatsappInstanceUrl}/send-text`
    
    console.log('📡 Enviando para Z-API:', apiUrl)
    console.log('📞 Número formatado:', numeroFormatado)
    console.log('🔑 Token (primeiros chars):', whatsappToken.substring(0, 8) + '...')
    
    const payload = {
      phone: numeroFormatado,
      message: mensagem
    }

    console.log('📦 Payload:', JSON.stringify(payload, null, 2))

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': whatsappToken
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()
    console.log('📋 Status da resposta:', response.status)
    console.log('📋 Resposta Z-API completa:', JSON.stringify(result, null, 2))
    
    if (!response.ok) {
      console.error('❌ Erro HTTP:', response.status, result)
      return false
    }
    
    // Z-API pode retornar success: false mesmo com status 200
    if (result.success === false) {
      console.error('❌ Z-API retornou success: false', result)
      return false
    }
    
    return true
  } catch (error) {
    console.error('❌ Erro ao enviar código via WhatsApp:', error)
    return false
  }
}

/**
 * Formatar número de telefone para padrão internacional
 */
function formatPhoneNumber(numero: string): string {
  // Remove caracteres não numéricos
  const cleaned = numero.replace(/\D/g, '')
  
  // Se tem 11 dígitos e não começa com 55, adiciona 55 (Brasil)
  if (cleaned.length === 11 && !cleaned.startsWith('55')) {
    return '55' + cleaned
  }
  
  return cleaned
}