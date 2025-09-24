import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    console.log('🧹 Executando limpeza de dados residuais para usuário ae5b5501-7f8a-46da-9cba-b9955a84e697');

    // Chamar função de limpeza
    const { data, error } = await supabase.functions.invoke('limpar-dados-residuais', {
      body: { userId: 'ae5b5501-7f8a-46da-9cba-b9955a84e697' }
    });

    if (error) {
      console.error('❌ Erro na limpeza:', error);
      throw error;
    }

    console.log('✅ Limpeza concluída:', data);

    return new Response(JSON.stringify({
      success: true,
      message: 'Limpeza de dados residuais executada com sucesso',
      resultado: data
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});