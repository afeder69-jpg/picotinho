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
    
    // VERSÃO SIMPLIFICADA: Apenas salvar no banco (sem enviar WhatsApp)
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
    console.log('📝 IMPORTANTE: Use o código', codigoVerificacao, 'para testar')
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Código de verificação gerado com sucesso',
      // TEMPORÁRIO para debug - remover em produção
      debug_codigo: codigoVerificacao
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