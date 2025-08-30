import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendWelcomeRequest {
  numeroWhatsApp: string
  nomeUsuario?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📱 Enviando mensagem de boas-vindas WhatsApp...')
    
    const { numeroWhatsApp, nomeUsuario }: SendWelcomeRequest = await req.json()
    
    if (!numeroWhatsApp) {
      throw new Error('Número do WhatsApp é obrigatório')
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Buscar token da API do WhatsApp
    const whatsappToken = Deno.env.get('WHATSAPP_API_TOKEN')
    
    if (!whatsappToken) {
      console.error('❌ Token da API do WhatsApp não configurado')
      throw new Error('Token da API do WhatsApp não configurado')
    }

    // Formatar número para envio (assumindo formato brasileiro)
    const numeroFormatado = formatPhoneNumber(numeroWhatsApp)
    
    // Mensagem de boas-vindas
    const mensagemBoasVindas = `👋 Olá${nomeUsuario ? `, ${nomeUsuario}` : ''}! Eu sou o Picotinho, assistente das suas compras!

Bem-vindo 🎉 Estou pronto para receber seus comandos.

Exemplo: "Picotinho, baixa do estoque 1kg de banana prata".

Digite "Picotinho" seguido do seu comando para começar! 🛒✨`

    // Enviar mensagem via Z-API (ou adaptável para outros provedores)
    const sucesso = await enviarMensagemWhatsApp(numeroFormatado, mensagemBoasVindas, whatsappToken)
    
    if (sucesso) {
      // Atualizar timestamp da última mensagem
      await supabase
        .from('whatsapp_configuracoes')
        .update({ ultima_mensagem: new Date().toISOString() })
        .eq('numero_whatsapp', numeroWhatsApp)
        
      console.log('✅ Mensagem de boas-vindas enviada com sucesso')
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Mensagem de boas-vindas enviada com sucesso'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      throw new Error('Falha ao enviar mensagem de boas-vindas')
    }

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem de boas-vindas:', error)
    
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
 * Envia mensagem via WhatsApp API (Z-API como exemplo)
 */
async function enviarMensagemWhatsApp(numeroDestino: string, mensagem: string, token: string): Promise<boolean> {
  try {
    // Para Z-API - adapte conforme seu provedor
    const apiUrl = `https://api.z-api.io/instances/YOUR_INSTANCE/token/${token}/send-text`
    
    const payload = {
      phone: numeroDestino,
      message: mensagem
    }

    console.log('📤 Enviando para:', numeroDestino)
    
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
  // Remove todos os caracteres não numéricos
  let cleaned = numero.replace(/\D/g, '')
  
  // Se não tem código do país, adiciona o do Brasil (55)
  if (cleaned.length === 11 && !cleaned.startsWith('55')) {
    cleaned = '55' + cleaned
  }
  
  return cleaned
}