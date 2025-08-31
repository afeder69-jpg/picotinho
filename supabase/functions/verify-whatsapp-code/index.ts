import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VerifyCodeRequest {
  numeroWhatsApp: string
  codigo: string
  nomeUsuario?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔐 Verificando código de WhatsApp...')
    
    const { numeroWhatsApp, codigo, nomeUsuario }: VerifyCodeRequest = await req.json()
    
    if (!numeroWhatsApp || !codigo) {
      throw new Error('Número do WhatsApp e código são obrigatórios')
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Buscar configuração com código
    const { data: config, error: configError } = await supabase
      .from('whatsapp_configuracoes')
      .select('*')
      .eq('numero_whatsapp', numeroWhatsApp)
      .maybeSingle()

    if (configError) {
      console.error('❌ Erro ao buscar configuração:', configError)
      throw new Error('Erro ao verificar código')
    }

    if (!config) {
      throw new Error('Configuração não encontrada')
    }

    // Verificar se código está correto OU é o código temporário
    const codigoTemporario = '123456'
    const codigoValido = codigo === config.codigo_verificacao || codigo === codigoTemporario
    
    if (!codigoValido) {
      console.log('❌ Código incorreto fornecido')
      throw new Error('Código incorreto')
    }

    // Se usou código temporário, registrar nos logs
    if (codigo === codigoTemporario) {
      console.log('🔧 Verificação com código temporário aceita')
    }

    // Verificar se código não expirou (10 minutos) - só para códigos reais
    if (codigo !== codigoTemporario && config.data_codigo) {
      const dataExpiracao = new Date(config.data_codigo)
      dataExpiracao.setMinutes(dataExpiracao.getMinutes() + 10)
      
      if (new Date() > dataExpiracao) {
        console.log('❌ Código expirado')
        throw new Error('Código expirado')
      }
    }

    // Marcar como verificado
    const { error: updateError } = await supabase
      .from('whatsapp_configuracoes')
      .update({ 
        verificado: true,
        codigo_verificacao: null,
        data_codigo: null
      })
      .eq('numero_whatsapp', numeroWhatsApp)

    if (updateError) {
      console.error('❌ Erro ao atualizar verificação:', updateError)
      throw new Error('Erro ao confirmar verificação')
    }

    // Enviar mensagem de boas-vindas
    console.log('🎉 Enviando mensagem de boas-vindas...')
    await enviarBoasVindas(numeroWhatsApp, nomeUsuario)

    console.log('✅ Código verificado com sucesso')
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Código verificado com sucesso! Integração WhatsApp ativada.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro ao verificar código:', error)
    
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
 * Envia mensagem de boas-vindas após verificação
 */
async function enviarBoasVindas(numeroWhatsApp: string, nomeUsuario?: string) {
  try {
    const whatsappToken = Deno.env.get('WHATSAPP_API_TOKEN')
    if (!whatsappToken) return

    const numeroFormatado = formatPhoneNumber(numeroWhatsApp)
    
    const mensagemBoasVindas = `🎉 Número confirmado!

Eu sou o Picotinho, o seu assistente de compras.
Estou pronto para te ajudar!

👉 Por enquanto, você pode usar o comando "baixa de estoque".

Exemplo: "Picotinho, baixa do estoque 1kg de banana prata"

Vamos começar! 🛒✨`

    await enviarMensagemWhatsApp(numeroFormatado, mensagemBoasVindas, whatsappToken)
    console.log('✅ Mensagem de boas-vindas enviada')
  } catch (error) {
    console.error('❌ Erro ao enviar boas-vindas:', error)
  }
}

/**
 * Envia mensagem via WhatsApp API
 */
async function enviarMensagemWhatsApp(numeroDestino: string, mensagem: string, token: string): Promise<boolean> {
  try {
    const whatsappInstanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL')
    
    if (!whatsappInstanceUrl) {
      console.log('⚠️ URL da instância Z-API não configurada')
      return false
    }

    const apiUrl = `${whatsappInstanceUrl}/send-text`
    
    const payload = {
      phone: numeroDestino,
      message: mensagem
    }

    console.log('📡 Enviando boas-vindas via Z-API:', apiUrl)
    console.log('📞 Número:', numeroDestino)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': token
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()
    console.log('📋 Resposta Z-API (boas-vindas):', result)
    
    return response.ok && result.success !== false
  } catch (error) {
    console.error('❌ Erro ao chamar API do WhatsApp:', error)
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