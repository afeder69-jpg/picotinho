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

    console.log('🏪 Iniciando normalização de estabelecimentos existentes...');

    // Buscar todas as notas que têm dados extraídos
    const { data: notas, error: notasError } = await supabase
      .from('notas_imagens')
      .select('id, dados_extraidos')
      .not('dados_extraidos', 'is', null);

    if (notasError) {
      throw new Error(`Erro ao buscar notas: ${notasError.message}`);
    }

    let contadorAtualizados = 0;
    let contadorProcessados = 0;

    for (const nota of notas || []) {
      try {
        contadorProcessados++;
        const dados = nota.dados_extraidos as any;
        let foiAtualizado = false;

        // Buscar nome original do estabelecimento
        const nomeOriginal = dados?.supermercado?.nome || dados?.estabelecimento?.nome || dados?.emitente?.nome;
        
        if (nomeOriginal && typeof nomeOriginal === 'string') {
          // Normalizar nome do estabelecimento
          const { data: nomeNormalizado } = await supabase.rpc('normalizar_nome_estabelecimento', {
            nome_input: nomeOriginal
          });
          
          const estabelecimentoNormalizado = nomeNormalizado || nomeOriginal.toUpperCase();
          
          // Verificar se o nome mudou
          if (estabelecimentoNormalizado !== nomeOriginal) {
            console.log(`📝 Normalizando: "${nomeOriginal}" → "${estabelecimentoNormalizado}"`);
            
            // Atualizar dados extraídos
            const dadosAtualizados = { ...dados };
            
            // Aplicar normalização em todos os locais possíveis
            if (dadosAtualizados.supermercado) {
              dadosAtualizados.supermercado.nome = estabelecimentoNormalizado;
              foiAtualizado = true;
            }
            if (dadosAtualizados.estabelecimento) {
              dadosAtualizados.estabelecimento.nome = estabelecimentoNormalizado;
              foiAtualizado = true;
            }
            if (dadosAtualizados.emitente) {
              dadosAtualizados.emitente.nome = estabelecimentoNormalizado;
              foiAtualizado = true;
            }
            
            if (foiAtualizado) {
              // Salvar no banco
              const { error: updateError } = await supabase
                .from('notas_imagens')
                .update({ dados_extraidos: dadosAtualizados })
                .eq('id', nota.id);
              
              if (updateError) {
                console.error(`❌ Erro ao atualizar nota ${nota.id}:`, updateError);
              } else {
                contadorAtualizados++;
                console.log(`✅ Nota ${nota.id} atualizada`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ Erro ao processar nota ${nota.id}:`, error);
      }
    }

    // Também atualizar a tabela precos_atuais
    console.log('💰 Atualizando tabela precos_atuais...');
    
    const { data: precos, error: precosError } = await supabase
      .from('precos_atuais')
      .select('id, estabelecimento_nome');

    if (precosError) {
      console.error('❌ Erro ao buscar preços:', precosError);
    } else {
      let contadorPrecosAtualizados = 0;
      
      for (const preco of precos || []) {
        if (preco.estabelecimento_nome) {
          const { data: nomeNormalizado } = await supabase.rpc('normalizar_nome_estabelecimento', {
            nome_input: preco.estabelecimento_nome
          });
          
          const estabelecimentoNormalizado = nomeNormalizado || preco.estabelecimento_nome.toUpperCase();
          
          if (estabelecimentoNormalizado !== preco.estabelecimento_nome) {
            const { error: updatePrecoError } = await supabase
              .from('precos_atuais')
              .update({ estabelecimento_nome: estabelecimentoNormalizado })
              .eq('id', preco.id);
            
            if (!updatePrecoError) {
              contadorPrecosAtualizados++;
              console.log(`💰 Preço atualizado: "${preco.estabelecimento_nome}" → "${estabelecimentoNormalizado}"`);
            }
          }
        }
      }
      
      console.log(`✅ ${contadorPrecosAtualizados} preços atualizados na tabela precos_atuais`);
    }

    const resultado = {
      success: true,
      notasProcessadas: contadorProcessados,
      notasAtualizadas: contadorAtualizados,
      message: `✅ Normalização concluída: ${contadorAtualizados}/${contadorProcessados} notas atualizadas`
    };

    console.log('🎉 Normalização de estabelecimentos concluída:', resultado);

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na normalização:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});