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
    console.log('🔐 Verificando código WhatsApp...')
    
    const { codigo, usuario_id } = await req.json()
    
    if (!codigo || !usuario_id) {
      throw new Error('Código e usuário são obrigatórios')
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Buscar configuração do usuário
    const { data: config, error: fetchError } = await supabase
      .from('whatsapp_configuracoes')
      .select('*')
      .eq('usuario_id', usuario_id)
      .maybeSingle()

    if (fetchError) {
      console.error('❌ Erro ao buscar configuração:', fetchError)
      throw fetchError
    }

    if (!config) {
      throw new Error('Configuração não encontrada')
    }

    console.log('📋 Configuração encontrada para usuário:', usuario_id)

    // Verificar se o código está correto
    if (config.codigo_verificacao !== codigo) {
      console.log('❌ Código incorreto. Esperado:', config.codigo_verificacao, 'Recebido:', codigo)
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Código de verificação incorreto'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verificar se o código não expirou (válido por 15 minutos)
    const dataCodigoDate = new Date(config.data_codigo)
    const agora = new Date()
    const diffMinutos = (agora.getTime() - dataCodigoDate.getTime()) / (1000 * 60)

    if (diffMinutos > 15) {
      console.log('⏰ Código expirado. Minutos desde criação:', diffMinutos)
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Código de verificação expirado. Solicite um novo código.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Código está correto e válido - ativar a configuração
    const { error: updateError } = await supabase
      .from('whatsapp_configuracoes')
      .update({
        verificado: true,
        ativo: true,
        codigo_verificacao: null, // Limpar código após uso
        data_codigo: null,
        updated_at: new Date().toISOString()
      })
      .eq('usuario_id', usuario_id)

    if (updateError) {
      console.error('❌ Erro ao ativar configuração:', updateError)
      throw updateError
    }

    console.log('✅ WhatsApp verificado e ativado para usuário:', usuario_id)

    return new Response(JSON.stringify({
      success: true,
      message: 'WhatsApp verificado e ativado com sucesso!',
      numero: config.numero_whatsapp
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro na verificação:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})