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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧪 Testando inserção automática de estoque...');

    // Executar inserção direta para a nota mais recente
    const { data: insertResult, error: insertError } = await supabase.functions.invoke('inserir-estoque-direto', {
      body: {
        notaId: '3c261f57-ebf1-4a92-8beb-f1f87b6ab595',
        usuarioId: 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
      }
    });

    if (insertError) {
      console.error('❌ Erro na inserção:', insertError);
      throw insertError;
    }

    console.log('✅ Resultado da inserção:', insertResult);

    // Verificar estoque após inserção
    const { data: estoque, error: estoqueError } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');

    if (estoqueError) {
      console.error('❌ Erro ao buscar estoque:', estoqueError);
    } else {
      console.log(`📦 Estoque atual: ${estoque?.length || 0} produtos`);
    }

    return new Response(JSON.stringify({
      success: true,
      insertResult,
      estoqueCount: estoque?.length || 0,
      primeirosItens: estoque?.slice(0, 3) || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      details: error
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});