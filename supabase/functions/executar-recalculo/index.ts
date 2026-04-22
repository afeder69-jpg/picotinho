import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only (one-off script).
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🧹 Executando recálculo completo de preços para usuário ae5b5501-7f8a-46da-9cba-b9955a84e697');

    // Chamar função de recálculo
    const { data, error } = await supabase.functions.invoke('recalcular-precos-notas', {
      body: { userId: 'ae5b5501-7f8a-46da-9cba-b9955a84e697' }
    });

    if (error) {
      console.error('❌ Erro no recálculo:', error);
      throw error;
    }

    console.log('✅ Recálculo concluído:', data);

    return new Response(JSON.stringify({
      success: true,
      message: 'Recálculo de preços executado com sucesso',
      resultado: data
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});