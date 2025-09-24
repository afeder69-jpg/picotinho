import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para extrair bairro do endereço
function extrairBairro(endereco: string): string | null {
  if (!endereco) return null;
  
  // Padrões comuns de endereços brasileiros
  // Ex: "AVENIDA CESARIO DE MELO, 5400, CAMPO GRANDE, RIO DE JANEIRO, RJ"
  // Ex: "RUA DAS FLORES, 123, COPACABANA, RIO DE JANEIRO, RJ"
  const partes = endereco.split(',').map(p => p.trim());
  
  if (partes.length >= 3) {
    // Geralmente o bairro é a 3ª parte (após rua e número)
    return partes[2] || null;
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔧 Iniciando correção de bairros para usuário: ${userId}`);

    // Buscar notas fiscais sem bairro do usuário
    const { data: notasSemBairro, error: errorNotas } = await supabase
      .from('notas_fiscais')
      .select('id, mercado, cnpj')
      .eq('user_id', userId)
      .is('bairro', null);

    if (errorNotas) {
      console.error('❌ Erro ao buscar notas sem bairro:', errorNotas);
      throw errorNotas;
    }

    console.log(`📋 Encontradas ${notasSemBairro?.length || 0} notas sem bairro`);

    let corrigidas = 0;
    let semDados = 0;

    // Para cada nota sem bairro, buscar dados correspondentes em notas_imagens
    for (const nota of notasSemBairro || []) {
      try {
        // Buscar nota_imagem correspondente com dados_extraidos
        const { data: notaImagem, error: errorImagem } = await supabase
          .from('notas_imagens')
          .select('dados_extraidos')
          .eq('usuario_id', userId)
          .not('dados_extraidos', 'is', null)
          .or(`dados_extraidos->>cnpj.eq.${nota.cnpj},dados_extraidos->estabelecimento->>cnpj.eq.${nota.cnpj},dados_extraidos->supermercado->>cnpj.eq.${nota.cnpj},dados_extraidos->emitente->>cnpj.eq.${nota.cnpj}`)
          .limit(1)
          .maybeSingle();

        if (errorImagem) {
          console.error(`❌ Erro ao buscar imagem para nota ${nota.id}:`, errorImagem);
          continue;
        }

        if (!notaImagem || !notaImagem.dados_extraidos) {
          console.log(`⚠️ Nenhum dado encontrado para nota ${nota.id} (${nota.mercado})`);
          semDados++;
          continue;
        }

        // Extrair endereço dos dados
        const dadosExtraidos = notaImagem.dados_extraidos as any;
        const endereco = dadosExtraidos?.estabelecimento?.endereco || 
                        dadosExtraidos?.supermercado?.endereco ||
                        dadosExtraidos?.emitente?.endereco;

        if (!endereco) {
          console.log(`⚠️ Endereço não encontrado para nota ${nota.id}`);
          semDados++;
          continue;
        }

        // Extrair bairro do endereço
        const bairro = extrairBairro(endereco);

        if (!bairro) {
          console.log(`⚠️ Não foi possível extrair bairro do endereço: "${endereco}"`);
          semDados++;
          continue;
        }

        // Atualizar nota fiscal com o bairro
        const { error: errorUpdate } = await supabase
          .from('notas_fiscais')
          .update({ bairro })
          .eq('id', nota.id);

        if (errorUpdate) {
          console.error(`❌ Erro ao atualizar nota ${nota.id}:`, errorUpdate);
          continue;
        }

        console.log(`✅ Bairro "${bairro}" atualizado para nota ${nota.id} (${nota.mercado})`);
        corrigidas++;

      } catch (error) {
        console.error(`❌ Erro ao processar nota ${nota.id}:`, error);
      }
    }

    const resultado = {
      success: true,
      notasVerificadas: notasSemBairro?.length || 0,
      bairrosCorrigidos: corrigidas,
      semDadosDisponiveis: semDados,
      message: `Correção concluída! ${corrigidas} bairros corrigidos de ${notasSemBairro?.length || 0} notas verificadas.`
    };

    console.log('📊 Resultado final:', resultado);

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});