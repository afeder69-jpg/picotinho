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

    console.log('🧪 TESTE NORMALIZAÇÃO IA-2 - Casos Específicos');

    const casosTeste = [
      'Tempero Verde 1 UNIDADE',
      'Milho Verde Predileto 170 G Lata',
      'FILE PEITO BDJ SEARA 1K',
      'ABACATE GRANEL',
      'ABACATE KG GRANEL',
      'SABÃO EM PÓ TIXAN YPÊ 1',
      'SABÃO EM PÓ TIXAN YPÊ 1, PRIMAVERA SACHÊ 2 UN'
    ];

    const resultados = [];

    for (const caso of casosTeste) {
      console.log(`\n🔍 Testando: ${caso}`);
      
      try {
        // Chamar a função normalizar-produto-ia2
        const { data, error } = await supabase.functions.invoke('normalizar-produto-ia2', {
          body: { nomeOriginal: caso }
        });

        if (error) {
          console.error(`❌ Erro para ${caso}:`, error);
          resultados.push({
            entrada: caso,
            erro: error.message,
            sucesso: false
          });
        } else {
          console.log(`✅ Resultado para ${caso}:`, JSON.stringify(data, null, 2));
          resultados.push({
            entrada: caso,
            resultado: data,
            sucesso: true
          });
        }
      } catch (err) {
        console.error(`💥 Exceção para ${caso}:`, err);
        resultados.push({
          entrada: caso,
          erro: err instanceof Error ? err.message : 'Erro desconhecido',
          sucesso: false
        });
      }
    }

    // Verificar feature flag
    const normalizacaoV1 = Deno.env.get('NORMALIZACAO_PRODUTOS_V1');
    console.log(`\n⚙️ NORMALIZACAO_PRODUTOS_V1: ${normalizacaoV1}`);

    // Verificar marcas cadastradas
    const { data: marcas } = await supabase
      .from('marcas_conhecidas')
      .select('nome')
      .eq('ativo', true)
      .in('nome', ['SEARA', 'PREDILETO', 'YPE', 'TIXAN']);

    console.log('🏷️ Marcas cadastradas:', marcas);

    const relatorio = {
      timestamp: new Date().toISOString(),
      feature_flag_ativa: normalizacaoV1 !== 'false',
      marcas_encontradas: marcas?.map(m => m.nome) || [],
      total_casos: casosTeste.length,
      casos_sucesso: resultados.filter(r => r.sucesso).length,
      casos_erro: resultados.filter(r => !r.sucesso).length,
      resultados: resultados
    };

    console.log('\n📊 RELATÓRIO FINAL:', JSON.stringify(relatorio, null, 2));

    return new Response(JSON.stringify(relatorio, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Erro geral:', error);
    return new Response(JSON.stringify({ 
      erro: error instanceof Error ? error.message : 'Erro desconhecido',
      stack: error instanceof Error ? error.stack : 'Stack não disponível'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});