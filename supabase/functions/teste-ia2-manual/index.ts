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

    console.log('🧪 TESTE MANUAL: Processando nota existente com IA-3');
    
    // Testar com a nota que já foi extraída
    const notaId = '0cbb6a6a-3db0-45c0-9374-da1d53454746';
    const usuarioId = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
    
    // Chamar a IA-3 diretamente
    const { data: ia3Response, error: ia3Error } = await supabase.functions.invoke('normalizar-produto-ia3', {
      body: {
        notaId: notaId,
        usuarioId: usuarioId,
        debug: true
      }
    });

    if (ia3Error) {
      console.error('❌ Erro na IA-2:', ia2Error);
      throw new Error(`Erro na IA-2: ${ia2Error.message}`);
    }

    console.log('✅ IA-2 executada com sucesso:', ia2Response);

    // Verificar se produtos foram inseridos
    const { data: estoqueData, error: estoqueError } = await supabase
      .from('estoque_app')
      .select('produto_nome, quantidade, preco_unitario_ultimo')
      .eq('user_id', usuarioId);

    if (estoqueError) {
      console.error('❌ Erro ao consultar estoque:', estoqueError);
    } else {
      console.log(`✅ Estoque atual: ${estoqueData?.length || 0} produtos`);
      console.log('📦 Produtos no estoque:', estoqueData?.slice(0, 3));
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Teste manual da IA-2 concluído',
        ia2_result: ia2Response,
        produtos_no_estoque: estoqueData?.length || 0,
        primeiros_produtos: estoqueData?.slice(0, 3) || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro no teste:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});