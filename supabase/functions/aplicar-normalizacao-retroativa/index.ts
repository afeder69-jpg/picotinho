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
    console.log('🚀 Iniciando aplicação de normalizações retroativas');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar todas as notas processadas com dados extraídos
    const { data: notas, error: notasError } = await supabase
      .from('notas_imagens')
      .select('id, usuario_id, dados_extraidos')
      .eq('processada', true)
      .not('dados_extraidos', 'is', null);

    if (notasError) {
      console.error('❌ Erro ao buscar notas:', notasError);
      throw notasError;
    }

    if (!notas || notas.length === 0) {
      console.log('ℹ️ Nenhuma nota processada encontrada');
      return new Response(
        JSON.stringify({
          success: true,
          estatisticas: {
            total_notas_analisadas: 0,
            notas_atualizadas: 0,
            normalizacoes_aplicadas: [],
            tempo_processamento_segundos: 0,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Total de notas a processar: ${notas.length}`);

    const inicioProcessamento = Date.now();
    let notasAtualizadas = 0;
    const normalizacoesAplicadasMap = new Map<string, { nome_original: string; nome_normalizado: string; quantidade_notas: number }>();

    // 2. Processar cada nota
    for (const nota of notas) {
      try {
        // 2.1. Extrair nome original do estabelecimento (tentar múltiplos campos)
        const dadosExtraidos = nota.dados_extraidos as any;
        
        const nomeOriginal = 
          dadosExtraidos?.supermercado?.nome ||
          dadosExtraidos?.estabelecimento?.nome ||
          dadosExtraidos?.emitente?.nome;

        if (!nomeOriginal || typeof nomeOriginal !== 'string') {
          console.log(`⏭️ Nota ${nota.id}: sem nome de estabelecimento`);
          continue;
        }

        // 2.2. Aplicar normalização usando a função do banco
        const { data: nomeNormalizado, error: normError } = await supabase.rpc(
          'normalizar_nome_estabelecimento',
          { nome_input: nomeOriginal }
        );

        if (normError) {
          console.error(`❌ Erro ao normalizar nota ${nota.id}:`, normError);
          continue;
        }

        // 2.3. Se o nome mudou, atualizar
        if (nomeNormalizado && nomeNormalizado !== nomeOriginal) {
          const dadosAtualizados = { ...dadosExtraidos };
          let camposAtualizados = 0;

          // Atualizar em todos os campos onde o nome aparece
          if (dadosAtualizados.supermercado?.nome) {
            dadosAtualizados.supermercado.nome = nomeNormalizado;
            camposAtualizados++;
          }
          if (dadosAtualizados.estabelecimento?.nome) {
            dadosAtualizados.estabelecimento.nome = nomeNormalizado;
            camposAtualizados++;
          }
          if (dadosAtualizados.emitente?.nome) {
            dadosAtualizados.emitente.nome = nomeNormalizado;
            camposAtualizados++;
          }

          if (camposAtualizados > 0) {
            // Salvar no banco
            const { error: updateError } = await supabase
              .from('notas_imagens')
              .update({
                dados_extraidos: dadosAtualizados,
                updated_at: new Date().toISOString(),
              })
              .eq('id', nota.id);

            if (updateError) {
              console.error(`❌ Erro ao atualizar nota ${nota.id}:`, updateError);
              continue;
            }

            notasAtualizadas++;
            console.log(`✅ Nota ${nota.id}: ${nomeOriginal} → ${nomeNormalizado}`);

            // Registrar estatística
            const key = `${nomeOriginal}→${nomeNormalizado}`;
            const existing = normalizacoesAplicadasMap.get(key);
            if (existing) {
              existing.quantidade_notas++;
            } else {
              normalizacoesAplicadasMap.set(key, {
                nome_original: nomeOriginal,
                nome_normalizado: nomeNormalizado,
                quantidade_notas: 1,
              });
            }
          }
        }
      } catch (notaError) {
        console.error(`❌ Erro ao processar nota ${nota.id}:`, notaError);
        // Continuar processando as outras notas
      }
    }

    const fimProcessamento = Date.now();
    const tempoSegundos = ((fimProcessamento - inicioProcessamento) / 1000).toFixed(2);

    const normalizacoesAplicadas = Array.from(normalizacoesAplicadasMap.values())
      .sort((a, b) => b.quantidade_notas - a.quantidade_notas);

    const resultado = {
      success: true,
      estatisticas: {
        total_notas_analisadas: notas.length,
        notas_atualizadas: notasAtualizadas,
        normalizacoes_aplicadas: normalizacoesAplicadas,
        tempo_processamento_segundos: parseFloat(tempoSegundos),
      },
    };

    console.log('🎉 Processamento concluído:', resultado.estatisticas);

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
