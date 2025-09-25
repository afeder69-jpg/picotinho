import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar o usuário autenticado do header de autorização
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Token de autorização necessário');
    }

    // Criar um cliente com o token do usuário para garantir que só limpe dados do usuário correto
    const supabaseClient = createClient(
      supabaseUrl, 
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            authorization: authHeader
          }
        }
      }
    );

    // Verificar se o usuário está autenticado
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Usuário não autenticado');
    }

    console.log(`🧹 Iniciando limpeza completa dos dados para usuário: ${user.id}`);

    // Executar a função de limpeza usando o service key para ter privilégios
    const { error: limpezaError } = await supabase.rpc('limpar_dados_usuario_completo');

    if (limpezaError) {
      throw new Error(`Erro na limpeza: ${limpezaError.message}`);
    }

    console.log('✅ Limpeza completa dos dados concluída');

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Todos os dados do usuário foram limpos com sucesso',
      usuario_id: user.id,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro na limpeza dos dados:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});