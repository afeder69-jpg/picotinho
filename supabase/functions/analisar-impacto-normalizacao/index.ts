import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Iniciando análise de impacto de normalizações');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar normalizações ativas
    const { data: normalizacoes, error: normError } = await supabase
      .from('normalizacoes_estabelecimentos')
      .select('id, nome_original, nome_normalizado')
      .eq('ativo', true)
      .order('nome_original');

    if (normError) {
      console.error('❌ Erro ao buscar normalizações:', normError);
      throw normError;
    }

    if (!normalizacoes || normalizacoes.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          total_notas_processadas: 0,
          normalizacoes_ativas: 0,
          impacto: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Contar total de notas processadas
    const { count: totalNotas, error: countError } = await supabase
      .from('notas_imagens')
      .select('id', { count: 'exact', head: true })
      .eq('processada', true)
      .not('dados_extraidos', 'is', null);

    if (countError) {
      console.error('❌ Erro ao contar notas:', countError);
      throw countError;
    }

    console.log(`📊 Total de notas processadas: ${totalNotas || 0}`);
    console.log(`📋 Normalizações ativas: ${normalizacoes.length}`);

    // 3. Para cada normalização, contar quantas notas têm aquele nome
    const impacto = [];
    let totalNotasAfetadas = 0;

    for (const norm of normalizacoes) {
      try {
        // Buscar notas que contenham o nome original em qualquer um dos campos
        const { data: notasComNome, error: searchError } = await supabase
          .from('notas_imagens')
          .select('id, dados_extraidos')
          .eq('processada', true)
          .not('dados_extraidos', 'is', null);

        if (searchError) {
          console.error(`❌ Erro ao buscar notas para ${norm.nome_original}:`, searchError);
          continue;
        }

        // Filtrar manualmente para verificar se o nome aparece nos dados
        let notasAfetadas = 0;
        if (notasComNome) {
          for (const nota of notasComNome) {
            const dados = nota.dados_extraidos as any;
            const nomeNota = 
              dados?.supermercado?.nome ||
              dados?.estabelecimento?.nome ||
              dados?.emitente?.nome;

            const cnpjNota = 
              dados?.estabelecimento?.cnpj ||
              dados?.emitente?.cnpj ||
              dados?.supermercado?.cnpj;

            // Testar normalização usando a função do banco (COM CNPJ!)
            if (nomeNota && typeof nomeNota === 'string') {
              try {
                const { data: nomeNormalizado, error: testError } = await supabase.rpc(
                  'normalizar_nome_estabelecimento',
                  { 
                    nome_input: nomeNota,
                    cnpj_input: cnpjNota || null
                  }
                );

                // Se o nome mudou, é porque a normalização se aplica
                if (!testError && nomeNormalizado && nomeNormalizado !== nomeNota) {
                  notasAfetadas++;
                  console.log(`   ✅ Nota ${nota.id}: ${nomeNota} → ${nomeNormalizado} (CNPJ: ${cnpjNota || 'não informado'})`);
                }
              } catch (testError) {
                console.error(`   ⚠️ Erro ao testar normalização da nota ${nota.id}:`, testError);
              }
            }
          }
        }

        if (notasAfetadas > 0) {
          impacto.push({
            id: norm.id,
            nome_original: norm.nome_original,
            nome_normalizado: norm.nome_normalizado,
            notas_afetadas: notasAfetadas,
          });
          totalNotasAfetadas += notasAfetadas;
          console.log(`✅ ${norm.nome_original} → ${notasAfetadas} notas`);
        }
      } catch (normProcessError) {
        console.error(`❌ Erro ao processar normalização ${norm.nome_original}:`, normProcessError);
      }
    }

    const resultado = {
      success: true,
      total_notas_processadas: totalNotas || 0,
      normalizacoes_ativas: normalizacoes.length,
      total_notas_afetadas: totalNotasAfetadas,
      impacto: impacto.sort((a, b) => b.notas_afetadas - a.notas_afetadas),
    };

    console.log('🎯 Análise concluída:', resultado);

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro fatal:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
