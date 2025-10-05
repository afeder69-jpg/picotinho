import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { pagina } = await req.json();

    if (!pagina || typeof pagina !== 'number') {
      throw new Error('Número de página inválido');
    }

    console.log(`🗑️ Desmarcando página ${pagina}...`);

    // Deletar registro da página
    const { error } = await supabase
      .from('open_food_facts_controle')
      .delete()
      .eq('pagina', pagina);

    if (error) throw error;

    console.log(`✅ Página ${pagina} desmarcada com sucesso`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        pagina,
        message: `Página ${pagina} desmarcada com sucesso` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('❌ Erro ao desmarcar página:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
