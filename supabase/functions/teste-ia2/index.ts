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

    const { descricao } = await req.json();

    if (!descricao) {
      return new Response(JSON.stringify({ 
        erro: 'Campo "descricao" é obrigatório',
        exemplo: '{ "descricao": "FILE PEITO BDJ SEARA 1K" }'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[TESTE-IA2] Testando normalização: "${descricao}"`);

    // Chamar IA-2 para normalização
    const { data: resultado, error } = await supabase.functions.invoke('normalizar-produto-ia2', {
      body: { nomeOriginal: descricao, debug: true }
    });

    if (error) {
      console.error('[TESTE-IA2] Erro na IA-2:', error);
      return new Response(JSON.stringify({
        erro: 'Falha na IA-2',
        detalhes: error,
        status: 'ERRO'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[TESTE-IA2] Resultado da IA-2:', JSON.stringify(resultado, null, 2));

    // Criar relatório de teste
    const relatorio = {
      entrada: {
        descricao_original: descricao,
        timestamp: new Date().toISOString()
      },
      saida: resultado,
      analise: {
        status: resultado.erro ? 'FALHA' : 'SUCESSO',
        expansoes_detectadas: analisarExpansoes(descricao, resultado.produto_nome_normalizado),
        categoria_adequada: avaliarCategoria(descricao, resultado.categoria),
        preservacao_peso: verificarPreservacaoPeso(descricao, resultado.produto_nome_normalizado),
        sku_gerado: resultado.produto_hash_normalizado ? 'SIM' : 'NÃO'
      },
      observabilidade: {
        tempo_processamento: 'Calculado pela edge function',
        origem: resultado.origem || 'ia2',
        debug_disponivel: true
      }
    };

    return new Response(JSON.stringify(relatorio, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[TESTE-IA2] Erro:', error);
    return new Response(JSON.stringify({
      erro: 'Erro interno do teste',
      motivo: error instanceof Error ? error.message : 'Erro desconhecido',
      stack: error instanceof Error ? error.stack : 'Stack não disponível'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function analisarExpansoes(original: string, normalizado: string): string[] {
  const expansoes = [];
  
  const abreviacoes = {
    'BDJ': 'BANDEJA',
    'FILE': 'FILÉ',
    'PC': 'PACOTE',
    'PCT': 'PACOTE',
    'K': 'KG',
    'LT': 'LITRO',
    'FRGO': 'FRANGO',
    'SAB': 'SABÃO'
  };

  for (const [abrev, expandido] of Object.entries(abreviacoes)) {
    if (original.toUpperCase().includes(abrev) && normalizado.toUpperCase().includes(expandido)) {
      expansoes.push(`${abrev} → ${expandido}`);
    }
  }

  return expansoes;
}

function avaliarCategoria(descricao: string, categoria: string): string {
  const palavrasChave = {
    'HORTIFRUTI': ['BANANA', 'MAÇÃ', 'TOMATE', 'ALFACE', 'CEBOLA'],
    'BEBIDAS': ['COCA', 'SUCO', 'ÁGUA', 'REFRIGERANTE'],
    'MERCEARIA': ['ARROZ', 'FEIJÃO', 'AÇÚCAR', 'MILHO'],
    'AÇOUGUE': ['FILÉ', 'FRANGO', 'CARNE', 'PEITO'],
    'LIMPEZA': ['SABÃO', 'DETERGENTE', 'DESINFETANTE'],
    'LATICÍNIOS/FRIOS': ['LEITE', 'QUEIJO', 'IOGURTE', 'MANTEIGA']
  };

  for (const [cat, palavras] of Object.entries(palavrasChave)) {
    if (palavras.some(palavra => descricao.toUpperCase().includes(palavra))) {
      return categoria === cat ? 'ADEQUADA' : `DEVERIA SER: ${cat}`;
    }
  }

  return categoria === 'OUTROS' ? 'ADEQUADA' : 'VERIFICAR MANUALMENTE';
}

function verificarPreservacaoPeso(original: string, normalizado: string): string {
  // Verificar se pesos/volumes foram preservados
  const regexPeso = /\d+\s*(G|KG|ML|L|LITRO)\b/gi;
  const pesosOriginais = original.match(regexPeso) || [];
  const pesosNormalizados = normalizado.match(regexPeso) || [];

  if (pesosOriginais.length === 0) {
    return 'SEM PESO DETECTADO';
  }

  if (pesosOriginais.length === pesosNormalizados.length) {
    return 'PRESERVADO';
  }

  return `POSSÍVEL PERDA: ${pesosOriginais.join(', ')} → ${pesosNormalizados.join(', ')}`;
}