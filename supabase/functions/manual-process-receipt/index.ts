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

    // Chamar o process-receipt-full para a nota mais recente
    const { data, error } = await supabase.functions.invoke('process-receipt-full', {
      body: { imagemId: 'a07462d1-69a0-47ae-b2d5-ebe996bfc165' }
    });

    if (error) {
      console.error('❌ Erro ao chamar process-receipt-full:', error);
      throw error;
    }

    console.log('✅ Função process-receipt-full executada com sucesso:', data);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Nota processada com sucesso',
      data 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});