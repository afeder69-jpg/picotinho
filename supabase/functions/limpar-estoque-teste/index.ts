import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    const { userId } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ 
        erro: 'userId é obrigatório',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🧹 Limpando estoque duplicado para usuário: ${userId}`);

    // Limpar todo o estoque do usuário
    const { error: deleteError } = await supabase
      .from('estoque_app')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('❌ Erro ao limpar estoque:', deleteError);
      return new Response(JSON.stringify({
        erro: 'Falha ao limpar estoque',
        detalhes: deleteError
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Estoque limpo com sucesso');

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: 'Estoque limpo com sucesso'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ERRO]:', error);
    return new Response(JSON.stringify({
      erro: 'Erro interno',
      motivo: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});