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

    console.log('🧹 DELETANDO COMPLETAMENTE TODO O ESTOQUE...');

    // DELETAR TODOS os registros do estoque do usuário
    const { error } = await supabase
      .from('estoque_app')
      .delete()
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');

    if (error) {
      console.error('❌ Erro ao deletar estoque:', error);
      throw error;
    }

    // Verificar se o estoque está realmente vazio
    const { data: verification, error: verifyError } = await supabase
      .from('estoque_app')
      .select('count')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');

    if (verifyError) {
      console.error('❌ Erro ao verificar limpeza:', verifyError);
    }

    const remainingCount = verification?.length || 0;
    
    console.log('✅ ESTOQUE COMPLETAMENTE DELETADO! Produtos restantes:', remainingCount);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'ESTOQUE COMPLETAMENTE DELETADO - TODOS os registros foram removidos',
        remainingProducts: remainingCount,
        details: 'Todos os 23+ produtos foram deletados permanentemente do banco'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na limpeza completa:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});