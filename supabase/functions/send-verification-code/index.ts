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
      console.error('❌ Erro no banco:', dbError)
      throw new Error(`Erro ao salvar código: ${dbError.message}`)
    }
      
    console.log('✅ Código salvo com sucesso no banco')
    
    // Enviar código via WhatsApp usando Z-API
    console.log('📱 Enviando código via WhatsApp...')
    const sucesso = await enviarCodigoWhatsApp(numeroWhatsApp, codigoVerificacao, nomeUsuario)
    
    if (!sucesso) {
      console.log('⚠️ Falha no envio - usando código temporário')
    } else {
      console.log('✅ Código enviado com sucesso!')
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: sucesso ? 'Código enviado via WhatsApp' : 'Código salvo - verifique configuração Z-API',
      enviado_whatsapp: sucesso,
      debug_info: sucesso ? 'Código enviado com sucesso' : 'Falha no envio Z-API - verifique configuração'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ ERRO COMPLETO:', error)
    
    return new Response(JSON.stringify({
      success: false,
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

    const apiUrl = `${whatsappInstanceUrl}/send-text`
    
    console.log('📡 Enviando para Z-API:', apiUrl)
    console.log('📞 Número formatado:', numeroFormatado)
    
    const payload = {
      phone: numeroFormatado,
      message: mensagem
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': whatsappToken
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()
    console.log('📋 Resposta Z-API:', result)
    
    return response.ok && result.success !== false
  } catch (error) {
    console.error('❌ Erro ao enviar código via WhatsApp:', error)
    return false
  }
}

/**
 * Formata número de telefone para padrão internacional
 */
function formatPhoneNumber(numero: string): string {
  let cleaned = numero.replace(/\D/g, '')
  if (cleaned.length === 11 && !cleaned.startsWith('55')) {
    cleaned = '55' + cleaned
  }
  return cleaned
}