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

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🧹 Iniciando limpeza completa de resíduos para: ${email}`);

    // 1. Buscar o user_id pelo email
    const { data: authUser, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      throw new Error(`Erro ao buscar usuários: ${authError.message}`);
    }

    const targetUser = authUser.users.find(user => user.email === email);
    
    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: 'Usuário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = targetUser.id;
    console.log(`👤 User ID encontrado: ${userId}`);

    // 2. Executar função de limpeza completa
    const { data: resultados, error: cleanupError } = await supabase
      .rpc('limpar_residuos_usuario_completo', { target_user_id: userId });

    if (cleanupError) {
      console.error('❌ Erro na limpeza:', cleanupError);
      throw cleanupError;
    }

    console.log('✅ Limpeza completa finalizada');
    console.log('📊 Resultados:', resultados);

    const totalRemovidosPorTabela = resultados?.reduce((acc: any, item: any) => {
      acc[item.tabela_limpa] = item.registros_removidos;
      return acc;
    }, {}) || {};

    const totalGeralRemovidos = resultados?.reduce((total: number, item: any) => {
      return total + (item.registros_removidos || 0);
    }, 0) || 0;

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Limpeza completa de resíduos realizada para ${email}`,
        userId: userId,
        resultados: resultados || [],
        totalRemovidosPorTabela,
        totalGeralRemovidos,
        resumo: {
          total_tabelas_processadas: resultados?.length || 0,
          total_registros_removidos: totalGeralRemovidos
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na limpeza de resíduos:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});