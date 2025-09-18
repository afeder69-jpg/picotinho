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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const { notaId, usuarioId } = await req.json();

    if (!notaId || !usuarioId) {
      throw new Error('notaId e usuarioId são obrigatórios');
    }

    console.log(`🚀 [PROCESSADOR DIRETO] Iniciando processamento da nota ${notaId} para usuário ${usuarioId}`);

    // 1. Buscar dados da nota fiscal
    const { data: nota, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', notaId)
      .eq('usuario_id', usuarioId)
      .single();

    if (notaError || !nota) {
      throw new Error(`Nota não encontrada: ${notaError?.message}`);
    }

    if (!nota.dados_extraidos || !nota.dados_extraidos.itens) {
      throw new Error('Nota não possui dados extraídos pela IA-1');
    }

    console.log(`📦 Processando ${nota.dados_extraidos.itens.length} itens da nota`);

    let itensProcessados = 0;
    let erros = 0;

    // 2. Processar cada item da nota com IA-2 e inserir no estoque
    for (const item of nota.dados_extraidos.itens) {
      try {
        console.log(`🔄 Processando item: ${item.descricao}`);

        // Chamar IA-2 para normalizar E inserir diretamente no estoque
        const ia2Response = await fetch(`${supabaseUrl}/functions/v1/normalizar-produto-ia2`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nomeOriginal: item.descricao,
            quantidadeOriginal: item.quantidade || 1,
            valorUnitarioOriginal: item.valor_unitario || 0,
            valorTotalOriginal: item.valor_total || 0,
            usuarioId: usuarioId,
            inserirNoEstoque: true, // ✅ ESTE É O SEGREDO!
            debug: true
          }),
        });

        if (!ia2Response.ok) {
          throw new Error(`IA-2 falhou: ${ia2Response.status}`);
        }

        const resultado = await ia2Response.json();
        console.log(`✅ Item processado e inserido: ${resultado.produto_nome_normalizado}`);
        itensProcessados++;

      } catch (itemError) {
        console.error(`❌ Erro ao processar item "${item.descricao}":`, itemError);
        erros++;
      }
    }

    // 3. Marcar nota como processada
    await supabase
      .from('notas_imagens')
      .update({ 
        processada: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', notaId);

    console.log(`🎉 [PROCESSADOR DIRETO] Concluído: ${itensProcessados} itens inseridos, ${erros} erros`);

    return new Response(JSON.stringify({
      sucesso: true,
      itensProcessados,
      erros,
      mensagem: `${itensProcessados} produtos adicionados ao estoque diretamente pela IA-2`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[PROCESSADOR DIRETO] ERRO:', error);
    
    return new Response(JSON.stringify({
      erro: error.message,
      sucesso: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});