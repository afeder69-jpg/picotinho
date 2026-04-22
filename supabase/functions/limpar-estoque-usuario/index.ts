import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireUser, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: require authenticated user; clear ONLY the caller's own stock.
  let authUserId: string;
  try {
    const ctx = await requireUser(req);
    authUserId = ctx.userId;
  } catch (authErr) {
    return authErrorResponse(authErr);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Limpar TODO o estoque do PRÓPRIO usuário autenticado (nunca de terceiros)
    const { data, error } = await supabase
      .from('estoque_app')
      .delete()
      .eq('user_id', authUserId);

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