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

    console.log('🔧 Iniciando correção automática agendada de preços...');

    // Buscar todos os usuários que têm produtos no estoque sem preço ou com preço zerado
    const { data: usuariosComProblemas, error: errorUsuarios } = await supabase
      .from('estoque_app')
      .select('user_id')
      .or('preco_unitario_ultimo.is.null,preco_unitario_ultimo.eq.0')
      .gt('quantidade', 0);

    if (errorUsuarios) {
      console.error('❌ Erro ao buscar usuários com problemas:', errorUsuarios);
      throw errorUsuarios;
    }

    // Obter IDs únicos de usuários
    const usuariosUnicos = [...new Set(usuariosComProblemas?.map(item => item.user_id) || [])];
    
    console.log(`📋 Encontrados ${usuariosUnicos.length} usuários com produtos sem preço`);

    let totalProdutosCorrigidos = 0;
    let totalErros = 0;

    // Para cada usuário, executar a correção
    for (const userId of usuariosUnicos) {
      try {
        console.log(`🔧 Corrigindo preços para usuário: ${userId}`);
        
        const { data, error } = await supabase.functions.invoke('fix-precos-automatico', {
          body: { userId }
        });

        if (error) {
          console.error(`❌ Erro ao corrigir usuário ${userId}:`, error);
          totalErros++;
        } else {
          const produtosCorrigidos = data?.produtosCorrigidos || 0;
          totalProdutosCorrigidos += produtosCorrigidos;
          console.log(`✅ Usuário ${userId}: ${produtosCorrigidos} produtos corrigidos`);
        }
      } catch (error) {
        console.error(`❌ Erro inesperado para usuário ${userId}:`, error);
        totalErros++;
      }
    }

    console.log(`✅ Correção automática agendada concluída:`);
    console.log(`   - Usuários processados: ${usuariosUnicos.length}`);
    console.log(`   - Total de produtos corrigidos: ${totalProdutosCorrigidos}`);
    console.log(`   - Erros: ${totalErros}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        usuariosProcessados: usuariosUnicos.length,
        totalProdutosCorrigidos,
        totalErros,
        message: `Correção automática agendada executada com sucesso`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral na correção agendada:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});