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

    console.log('🔄 Iniciando correção de normalização em notas existentes...');

    // Buscar todas as notas que têm dados extraídos
    const { data: notasComDados, error: fetchError } = await supabase
      .from('notas_imagens')
      .select('id, dados_extraidos, usuario_id')
      .not('dados_extraidos', 'is', null);

    if (fetchError) {
      throw new Error(`Erro ao buscar notas: ${fetchError.message}`);
    }

    let processadas = 0;
    let atualizadas = 0;

    for (const nota of notasComDados || []) {
      try {
        const dados = nota.dados_extraidos as any;
        let precisaAtualizar = false;
        
        // Verificar todos os possíveis locais onde o nome do estabelecimento pode estar
        const nomeOriginal = dados?.supermercado?.nome || 
                            dados?.estabelecimento?.nome || 
                            dados?.emitente?.nome;

        if (nomeOriginal && typeof nomeOriginal === 'string') {
          console.log(`🏪 Verificando normalização para: "${nomeOriginal}"`);
          
          // Aplicar normalização usando a função do banco
          const { data: nomeNormalizado, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
            nome_input: nomeOriginal
          });
          
          if (normError) {
            console.error(`❌ Erro na normalização para nota ${nota.id}:`, normError);
            continue;
          }
          
          const estabelecimentoNormalizado = nomeNormalizado || nomeOriginal.toUpperCase();
          
          // Verificar se realmente precisa atualizar (se o nome mudou)
          if (estabelecimentoNormalizado !== nomeOriginal) {
            precisaAtualizar = true;
            
            // Aplicar normalização em todos os locais possíveis
            if (dados.supermercado) {
              dados.supermercado.nome = estabelecimentoNormalizado;
            }
            if (dados.estabelecimento) {
              dados.estabelecimento.nome = estabelecimentoNormalizado;
            }
            if (dados.emitente) {
              dados.emitente.nome = estabelecimentoNormalizado;
            }
            
            console.log(`✅ Normalização aplicada: "${nomeOriginal}" → "${estabelecimentoNormalizado}"`);
          }
        }

        if (precisaAtualizar) {
          // Salvar dados normalizados de volta
          const { error: updateError } = await supabase
            .from('notas_imagens')
            .update({ 
              dados_extraidos: dados,
              updated_at: new Date().toISOString()
            })
            .eq('id', nota.id);
          
          if (updateError) {
            console.error(`❌ Erro ao atualizar nota ${nota.id}:`, updateError);
          } else {
            atualizadas++;
            console.log(`💾 Nota ${nota.id} atualizada com sucesso`);
          }
        }
        
        processadas++;
      } catch (error) {
        console.error(`❌ Erro ao processar nota ${nota.id}:`, error);
      }
    }

    console.log(`✅ Correção concluída: ${processadas} notas processadas, ${atualizadas} atualizadas`);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Correção concluída: ${processadas} notas processadas, ${atualizadas} atualizadas`,
      processadas,
      atualizadas
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Erro na correção de normalização:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});