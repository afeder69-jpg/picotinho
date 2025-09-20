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

    // Limpar TODO o estoque do usuário específico
    const { data, error } = await supabase
      .from('estoque_app')
      .delete()
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');

    if (error) {
      console.error('❌ Erro ao limpar estoque:', error);
      throw error;
    }

    console.log('✅ Estoque completamente limpo!');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Estoque completamente limpo - todos os produtos deletados',
        deletedItems: data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});