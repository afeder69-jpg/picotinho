import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificarCodigoRequest {
  codigo: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verificar usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    const { codigo }: VerificarCodigoRequest = await req.json();

    if (!codigo || codigo.length !== 6) {
      throw new Error('Código deve ter 6 dígitos');
    }

    // Buscar configuração do usuário
    const { data: config, error: configError } = await supabase
      .from('whatsapp_configuracoes')
      .select('*')
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (configError) {
      console.error('Erro ao buscar configuração:', configError);
      throw new Error('Erro ao verificar código');
    }

    if (!config) {
      throw new Error('Configuração não encontrada. Solicite um novo código.');
    }

    if (config.verificado) {
      throw new Error('Número já verificado');
    }

    if (!config.codigo_verificacao) {
      throw new Error('Nenhum código de verificação encontrado. Solicite um novo código.');
    }

    // Verificar se o código não expirou (10 minutos)
    const agora = new Date();
    const dataCodigo = new Date(config.data_codigo);
    const diferencaMinutos = (agora.getTime() - dataCodigo.getTime()) / (1000 * 60);

    if (diferencaMinutos > 10) {
      // Limpar código expirado
      await supabase
        .from('whatsapp_configuracoes')
        .update({
          codigo_verificacao: null,
          data_codigo: null
        })
        .eq('usuario_id', user.id);

      throw new Error('Código expirado. Solicite um novo código.');
    }

    // Verificar se o código está correto
    if (config.codigo_verificacao !== codigo) {
      throw new Error('Código incorreto. Tente novamente.');
    }

    // Verificar se há número pendente para ativação
    let numeroFinal = config.numero_whatsapp;
    let webhookData = null;
    
    try {
      webhookData = config.webhook_token ? JSON.parse(config.webhook_token) : null;
    } catch (e) {
      // webhook_token não é JSON válido, manter como string normal
    }

    // Se há número pendente, usar ele ao verificar
    if (webhookData?.numero_pendente) {
      numeroFinal = webhookData.numero_pendente;
    }

    // Marcar como verificado, ativar novo número e limpar dados temporários
    const { error: updateError } = await supabase
      .from('whatsapp_configuracoes')
      .update({
        numero_whatsapp: numeroFinal, // Ativar o número (novo ou atual)
        verificado: true,
        codigo_verificacao: null,
        data_codigo: null,
        webhook_token: '', // Limpar dados temporários
        updated_at: new Date().toISOString()
      })
      .eq('usuario_id', user.id);

    if (updateError) {
      console.error('Erro ao marcar como verificado:', updateError);
      throw new Error('Erro ao verificar número');
    }

    console.log(`Número ${numeroFinal} verificado com sucesso para usuário ${user.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Número verificado com sucesso! Agora você pode receber comandos do Picotinho.',
      numero_verificado: numeroFinal
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Erro na função verificar-codigo-whatsapp:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Erro interno do servidor' 
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);