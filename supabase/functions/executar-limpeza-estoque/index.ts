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

    console.log('🧹 Iniciando limpeza completa do estoque...');

    // Deletar TODOS os produtos do estoque do usuário
    const { data, error } = await supabase
      .from('estoque_app')
      .delete()
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');

    if (error) {
      console.error('❌ Erro ao deletar produtos:', error);
      throw error;
    }

    // Verificar se ainda restam produtos
    const { data: remaining, error: checkError } = await supabase
      .from('estoque_app')
      .select('count')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');

    if (checkError) {
      console.error('❌ Erro ao verificar produtos restantes:', checkError);
    }

    console.log('✅ Limpeza concluída! Produtos restantes:', remaining?.length || 0);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Estoque completamente zerado - todos os produtos foram deletados',
        remainingProducts: remaining?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na limpeza:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});