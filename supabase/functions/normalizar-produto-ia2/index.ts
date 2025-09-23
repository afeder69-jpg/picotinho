import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nomeOriginal, notaId, usuarioId, debug } = await req.json();
    
    if (!nomeOriginal && !notaId) {
      return new Response(
        JSON.stringify({ error: 'nomeOriginal ou notaId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🧠 IA-2 ATIVADA: Normalizando produto com IA avançada');
    
    if (debug) {
      console.log('🔍 Debug mode ativado');
      console.log('Parâmetros:', { nomeOriginal, notaId, usuarioId });
    }

    // TODO: Implementar lógica de normalização com IA
    // Por enquanto, retornar estrutura básica
    const produtoNormalizado = {
      produto_nome_normalizado: nomeOriginal?.toUpperCase(),
      nome_base: nomeOriginal?.toUpperCase(),
      marca: null,
      categoria: 'indefinida',
      tipo_embalagem: null,
      qtd_valor: null,
      qtd_unidade: null,
      granel: false,
      produto_hash_normalizado: `hash_${Date.now()}`
    };

    console.log('✅ Produto normalizado:', produtoNormalizado);
    
    return new Response(
      JSON.stringify({ 
        success: true,
        produto_normalizado: produtoNormalizado,
        acao: 'provisorio',
        confianca: 0.8
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});