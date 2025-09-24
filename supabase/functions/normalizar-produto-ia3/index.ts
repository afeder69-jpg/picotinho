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
    const promptIA3 = `Você é a IA3 do Picotinho, especializada em normalização de produtos alimentícios.

MISSÃO: Receber um produto cru e transformá-lo em um produto normalizado e padronizado.

CONTEXTO - PRODUTOS EXISTENTES:
${contextoProdutos}

MARCAS CONHECIDAS: ${marcas}

CATEGORIAS DISPONÍVEIS:
- açougue (carnes, frangos, peixes, embutidos)
- padaria (pães, bolos, salgados)
- hortifruti (frutas, verduras, legumes)
- mercearia (arroz, feijão, molhos, temperos, conservas)
- frios-e-laticinios (queijos, iogurtes, leites, manteigas)
- bebidas (refrigerantes, sucos, águas, bebidas alcólicas)
- higiene-e-limpeza (sabonetes, detergentes, papel higiênico)
- outros

REGRAS DE NORMALIZAÇÃO:
1. PRESERVAR SEMPRE: marcas (Nestlé, Italac, Coca-Cola), quantidades (200g, 1L, 500ml), medidas
2. PADRONIZAR: "cr." → "Creme", "refrig." → "Refrigerante", "choc." → "Chocolate"
3. CORRIGIR: "leite" → "Leite", capitalize primeira letra de cada palavra importante
4. UNIDADES: UN (unidade), KG (quilo), L (litro), ML (mililitro), G (grama)
5. CATEGORIA: obrigatória baseada no tipo de produto

PRODUTO A NORMALIZAR: "${produto_nome}"

INSTRUÇÕES:
1. Analise o produto cru e normalize o nome
2. Identifique marca, quantidade, unidade e categoria
3. Busque produtos similares nos existentes para calcular score de similaridade
4. Aplique as regras de confiança:
   - Score ≥ 0.9: aceito_automatico (associar ao SKU existente)
   - Score 0.75-0.89: enviado_revisao (produto similar existe, mas precisa confirmação)
   - Score < 0.75: novo_sku_sugerido (produto novo, criar SKU)

RESPONDA APENAS COM JSON VÁLIDO:
{
  "nome_original": "${produto_nome}",
  "nome_normalizado": "Nome Padronizado Do Produto",
  "sku": "SKU123 ou null",
  "acao": "aceito_automatico | enviado_revisao | novo_sku_sugerido",
  "score": 0.85,
  "categoria": "categoria_obrigatoria",
  "marca": "Marca Detectada ou null",
  "quantidade": "200g ou 1L ou 500ml ou null",
  "unidade": "UN | KG | L | ML | G"
}`;

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