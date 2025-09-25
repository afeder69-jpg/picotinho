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

    console.log('🔍 Debugando preços do sabão YPE');

    // 1. Verificar o que está no estoque
    const { data: estoque, error: estoqueErr } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697')
      .ilike('produto_nome', '%sabao%ype%');

    console.log('📦 Estoque:', estoque);

    // 2. Verificar precos_atuais
    const { data: precosGerais, error: precosGeraisErr } = await supabase
      .from('precos_atuais')
      .select('*')
      .ilike('produto_nome', '%sabao%ype%');

    console.log('💰 Preços gerais:', precosGerais);

    // 3. Verificar precos_atuais_usuario
    const { data: precosUsuario, error: precosUsuarioErr } = await supabase
      .from('precos_atuais_usuario')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697')
      .ilike('produto_nome', '%sabao%ype%');

    console.log('👤 Preços do usuário:', precosUsuario);

    // 4. Testar função preco-atual-usuario
    const { data: resultadoFuncao, error: funcaoErr } = await supabase.functions.invoke('preco-atual-usuario', {
      body: {
        userId: 'ae5b5501-7f8a-46da-9cba-b9955a84e697',
        latitude: -22.9070486,
        longitude: -43.5692093,
        raioKm: 10
      }
    });

    console.log('🎯 Resultado da função preco-atual-usuario:', resultadoFuncao);

    // 5. Filtrar só os produtos YPE
    const produtosYpe = resultadoFuncao?.resultados?.filter((p: any) => 
      p.produto_nome.toUpperCase().includes('SABAO') && 
      p.produto_nome.toUpperCase().includes('YPE')
    ) || [];

    console.log('📋 Produtos YPE encontrados:', produtosYpe);

    return new Response(JSON.stringify({
      success: true,
      debug: {
        estoque,
        precosGerais,
        precosUsuario,
        resultadoFuncao,
        produtosYpe
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erro no debug:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});