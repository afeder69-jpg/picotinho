import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { noteId } = await req.json();
    
    if (!noteId) {
      throw new Error('noteId é obrigatório');
    }

    console.log('🧹 Limpando nota problemática:', noteId);

    // Excluir a nota problemática com service role (contorna RLS)
    const { error } = await supabase
      .from('notas_imagens')
      .delete()
      .eq('id', noteId);

    if (error) {
      console.error('❌ Erro ao excluir:', error);
      throw error;
    }

    console.log('✅ Nota removida com sucesso:', noteId);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Nota removida com sucesso' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});