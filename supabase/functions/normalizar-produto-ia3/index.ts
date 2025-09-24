import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { produto_nome, usuario_id, debug = false } = await req.json();

    if (!produto_nome) {
      return new Response(
        JSON.stringify({ error: 'produto_nome é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar produtos normalizados existentes para contexto
    const { data: produtosExistentes } = await supabase
      .from('produtos_normalizados')
      .select('sku, nome_padrao, categoria, marca, unidade_medida')
      .eq('ativo', true)
      .limit(500);

    // Buscar marcas conhecidas
    const { data: marcasConhecidas } = await supabase
      .from('marcas_conhecidas')
      .select('nome')
      .eq('ativo', true);

    // Preparar contexto para IA
    const contextoProdutos = produtosExistentes?.map(p => 
      `SKU: ${p.sku} | Nome: ${p.nome_padrao} | Categoria: ${p.categoria} | Marca: ${p.marca || 'N/A'} | Unidade: ${p.unidade_medida}`
    ).join('\n') || '';

    const marcas = marcasConhecidas?.map(m => m.nome).join(', ') || '';

    // Prompt da IA3 para normalização de produtos
    const promptIA3 = `Você é um especialista em normalização de produtos de supermercado para um sistema de comparação de preços.

Sua tarefa é receber um item cru extraído de uma nota fiscal e devolver um JSON estruturado com nome padronizado, SKU e atributos normalizados.

CONTEXTO - PRODUTOS EXISTENTES COM SKU:
${contextoProdutos}

MARCAS CONHECIDAS: ${marcas}

## Instruções obrigatórias:

1. **Nome original**: sempre preserve como recebido no campo "nome_original".
2. **Nome normalizado**:
   - Corrija abreviações e erros comuns.
   - Padronize capitalização: primeiras letras maiúsculas, marcas preservadas (Italac, Nestlé, Coca-Cola).
   - Preserve sempre peso/volume da embalagem (200g, 1L, 500ml).
   - Remova códigos de barras e ruídos.
   - Exemplo: "cr. leite italac 200 gr" → "Creme de Leite Italac 200g".
3. **SKU**:
   - Se já existir SKU conhecido para este produto (fornecido via contexto acima), retorne no campo "sku".
   - Caso não exista, retorne null.
4. **Ação**:
   - "aceito_automatico" → confiança alta (≥0.9).
   - "enviado_revisao" → confiança média (≥0.75 e <0.9).
   - "novo_sku_sugerido" → confiança baixa (<0.75).
5. **Categoria obrigatória**:
   - hortifruti: frutas, verduras, legumes, temperos verdes, ervas frescas
   - mercearia: arroz, feijão, massas, sal, açúcar, óleo, azeite, ovos, aveia, conservas, molhos
   - bebidas: refrigerantes, sucos, água, cervejas, vinhos, energéticos (exceto leite)
   - laticínios/frios: leite, queijos, iogurtes, manteiga, requeijão, embutidos
   - limpeza: detergentes, sabões, desinfetantes, esponja de aço, amaciantes
   - higiene/farmácia: sabonetes, shampoos, pasta de dente, papel higiênico, medicamentos
   - açougue: carnes frescas, frango, peixes, linguiças
   - padaria: pães, bolos, biscoitos, torradas
   - congelados: sorvetes, pizzas congeladas, produtos congelados
   - pet: rações, produtos para animais
   - outros: apenas se não se encaixar em nenhuma das acima
6. **Marca**: identifique marca se existir (Nestlé, Italac, Coca-Cola, etc.), caso contrário null.
7. **Quantidade e unidade**: identificar valor e unidade (ex.: 200g, 1L, 6UN).
8. **Validação**:
   - Sempre retornar categoria preenchida.
   - Nunca deixar null em "categoria".
   - Retornar sempre um JSON válido.

## Estrutura obrigatória do JSON de saída:
{
  "nome_original": "texto cru recebido",
  "nome_normalizado": "texto padronizado",
  "sku": "string ou null",
  "acao": "aceito_automatico | enviado_revisao | novo_sku_sugerido",
  "score": 0.0,
  "categoria": "categoria_obrigatoria",
  "marca": "string ou null",
  "quantidade": "ex: 200g, 1L, 500ml, 6UN",
  "unidade": "G | ML | L | KG | UN"
}

PRODUTO A NORMALIZAR: "${produto_nome}"

Responda APENAS o JSON. Não explique.`;

    // Chamar OpenAI
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🤖 Chamando IA3 para normalizar produto:', produto_nome);

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: promptIA3
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('Erro na chamada OpenAI:', errorText);
      return new Response(
        JSON.stringify({ error: 'Erro na normalização via IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAIData = await openAIResponse.json();
    const resultadoIA = openAIData.choices[0].message.content;

    console.log('📝 Resposta bruta da IA3:', resultadoIA);

    // Tentar parsear JSON da resposta
    let resultado;
    try {
      // Limpar possíveis caracteres extras antes/depois do JSON
      const jsonLimpo = resultadoIA.replace(/```json|```/g, '').trim();
      resultado = JSON.parse(jsonLimpo);
    } catch (error) {
      console.error('Erro ao parsear JSON da IA:', error);
      return new Response(
        JSON.stringify({ error: 'Resposta da IA inválida' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar resultado
    if (!resultado.nome_normalizado || !resultado.categoria || !resultado.acao) {
      console.error('Resposta da IA incompleta:', resultado);
      return new Response(
        JSON.stringify({ error: 'Resposta da IA incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log do resultado para debug
    console.log('✅ IA3 processou com sucesso:', {
      original: produto_nome,
      normalizado: resultado.nome_normalizado,
      acao: resultado.acao,
      score: resultado.score,
      categoria: resultado.categoria
    });

    // Se for aceito automático e tiver SKU, registrar no log
    if (resultado.acao === 'aceito_automatico' && resultado.sku && usuario_id) {
      await supabase
        .from('normalizacoes_log')
        .insert({
          texto_origem: produto_nome,
          acao: 'aceito_automatico_ia3',
          score_agregado: resultado.score,
          user_id: usuario_id,
          produto_id: resultado.sku,
          metadata: resultado
        });
    }

    // Se for enviado para revisão, criar proposta
    if (resultado.acao === 'enviado_revisao') {
      await supabase
        .from('propostas_revisao')
        .insert({
          texto_origem: produto_nome,
          status: 'pendente',
          score_melhor: resultado.score,
          candidatos: [resultado],
          fonte: 'ia3_normalizacao'
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        resultado,
        debug: debug ? { prompt: promptIA3, resposta_bruta: resultadoIA } : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Erro geral na IA3:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno na normalização' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});