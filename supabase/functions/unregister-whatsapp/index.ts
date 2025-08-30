import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UnregisterRequest {
  numeroWhatsApp: string
  nomeUsuario?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📱 Descadastrando número do WhatsApp...')
    
    const { numeroWhatsApp, nomeUsuario }: UnregisterRequest = await req.json()
    
    if (!numeroWhatsApp) {
      throw new Error('Número do WhatsApp é obrigatório')
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Verificar se o número existe e está verificado
    const { data: config, error: configError } = await supabase
      .from('whatsapp_configuracoes')
      .select('*')
      .eq('numero_whatsapp', numeroWhatsApp)
      .maybeSingle()

    if (configError) {
      console.error('❌ Erro ao buscar configuração:', configError)
      throw new Error('Erro ao buscar configuração')
    }

    if (!config) {
      console.log('⚠️ Número não encontrado no sistema')
      return new Response(JSON.stringify({
        success: true,
        message: 'Número não estava cadastrado'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Se o número estava verificado, enviar mensagem de despedida
    if (config.verificado) {
      const whatsappToken = Deno.env.get('WHATSAPP_API_TOKEN')
      
      if (whatsappToken) {
        const numeroFormatado = formatPhoneNumber(numeroWhatsApp)
        
        const mensagemDespedida = `👋 Seu número foi desvinculado com sucesso!

Obrigado por usar o Picotinho${nomeUsuario ? `, ${nomeUsuario}` : ''}! 

Se quiser voltar a usar nossos comandos, você pode cadastrar seu número novamente a qualquer momento.

Até logo! 🛒✨`

        try {
          await enviarMensagemWhatsApp(numeroFormatado, mensagemDespedida, whatsappToken)
          console.log('✅ Mensagem de despedida enviada')
        } catch (error) {
          console.error('⚠️ Erro ao enviar mensagem de despedida:', error)
          // Não bloquear o descadastro se a mensagem falhar
        }
      }
    }

    // Remover configuração do banco
    const { error: deleteError } = await supabase
      .from('whatsapp_configuracoes')
      .delete()
      .eq('numero_whatsapp', numeroWhatsApp)

    if (deleteError) {
      console.error('❌ Erro ao remover configuração:', deleteError)
      throw new Error('Erro ao descadastrar número')
    }

    console.log('✅ Número descadastrado com sucesso')
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Número descadastrado com sucesso'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro ao descadastrar número:', error)
    
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
 * Envia mensagem via WhatsApp API
 */
async function enviarMensagemWhatsApp(numeroDestino: string, mensagem: string, token: string): Promise<boolean> {
  try {
    const apiUrl = `https://api.z-api.io/instances/YOUR_INSTANCE/token/${token}/send-text`
    
    const payload = {
      phone: numeroDestino,
      message: mensagem
    }

    console.log('📤 Enviando mensagem de despedida para:', numeroDestino)
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()
    console.log('📋 Resposta da API:', result)

    if (response.ok && result.success !== false) {
      return true
    } else {
      console.error('❌ Erro na API do WhatsApp:', result)
      return false
    }

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