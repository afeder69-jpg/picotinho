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

    // Buscar configuração do usuário (telefone que está sendo verificado)
    const { data: telefones, error: configError } = await supabase
      .from('whatsapp_telefones_autorizados')
      .select('*')
      .eq('usuario_id', user.id)
      .eq('verificado', false)
      .order('created_at', { ascending: false });

    if (configError) {
      console.error('Erro ao buscar telefones:', configError);
      throw new Error('Erro ao verificar código');
    }

    if (!telefones || telefones.length === 0) {
      throw new Error('Nenhum telefone pendente de verificação encontrado. Solicite um novo código.');
    }

    // Encontrar o telefone com código válido
    let telefoneParaVerificar = null;
    
    for (const telefone of telefones) {
      if (telefone.codigo_verificacao === codigo) {
        // Verificar se o código não expirou (10 minutos)
        const agora = new Date();
        const dataCodigo = new Date(telefone.data_codigo);
        const diferencaMinutos = (agora.getTime() - dataCodigo.getTime()) / (1000 * 60);

        if (diferencaMinutos <= 10) {
          telefoneParaVerificar = telefone;
          break;
        }
      }
    }

    if (!telefoneParaVerificar) {
      // Limpar códigos expirados
      await supabase
        .from('whatsapp_telefones_autorizados')
        .update({
          codigo_verificacao: null,
          data_codigo: null
        })
        .eq('usuario_id', user.id)
        .eq('verificado', false);

      throw new Error('Código incorreto ou expirado. Solicite um novo código.');
    }

    // Marcar telefone como verificado
    const { error: updateError } = await supabase
      .from('whatsapp_telefones_autorizados')
      .update({
        verificado: true,
        codigo_verificacao: null,
        data_codigo: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', telefoneParaVerificar.id);

    if (updateError) {
      console.error('Erro ao marcar como verificado:', updateError);
      throw new Error('Erro ao verificar número');
    }

    console.log(`Número ${telefoneParaVerificar.numero_whatsapp} (${telefoneParaVerificar.tipo}) verificado com sucesso para usuário ${user.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Número ${telefoneParaVerificar.tipo === 'principal' ? 'principal' : 'extra'} verificado com sucesso! Agora você pode receber comandos do Picotinho.`,
      numero_verificado: telefoneParaVerificar.numero_whatsapp,
      tipo_telefone: telefoneParaVerificar.tipo
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Erro na função verificar-codigo-whatsapp:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error instanceof Error ? error.message : String(error)) || 'Erro interno do servidor' 
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);