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

    const { nomeOriginal, debug = false } = await req.json();

    if (!nomeOriginal) {
      throw new Error('nomeOriginal é obrigatório');
    }

    console.log(`[IA-2] Processando: "${nomeOriginal}"`);

    // 1. Buscar normalização manual prioritária
    const normalizacaoManual = await buscarNormalizacaoManual(supabase, nomeOriginal);
    if (normalizacaoManual) {
      console.log(`[IA-2] Usando normalização manual: ${JSON.stringify(normalizacaoManual)}`);
      return new Response(JSON.stringify(normalizacaoManual), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Processar com IA-2 (OpenAI)
    const resultadoIA2 = await processarComIA2(openaiApiKey, nomeOriginal, debug);
    
    // 3. Gerar hash determinístico para SKU
    const produtoHash = await gerarHashSKU(resultadoIA2);
    resultadoIA2.produto_hash_normalizado = produtoHash;

    console.log(`[IA-2] Resultado final: ${JSON.stringify(resultadoIA2)}`);

    return new Response(JSON.stringify(resultadoIA2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[IA-2] ERRO CRÍTICO:', error);
    
    // FAIL-CLOSED: Se IA falhar, retornar erro explícito
    return new Response(JSON.stringify({
      erro: 'IA_INDISPONIVEL',
      motivo: error.message,
      status: 'PENDENTE_NORMALIZACAO',
      instrucoes: 'Aguarde a IA voltar e reprocesse esta nota'
    }), {
      status: 503, // Service Unavailable
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function buscarNormalizacaoManual(supabase: any, nomeOriginal: string) {
  const nomeProcessado = nomeOriginal.toUpperCase().trim();
  
  const { data: normalizacao } = await supabase
    .from('normalizacoes_produtos')
    .select('*')
    .eq('nome_original', nomeProcessado)
    .eq('ativo', true)
    .single();

  if (normalizacao) {
    return {
      produto_nome_normalizado: normalizacao.nome_normalizado,
      nome_base: normalizacao.nome_base || normalizacao.nome_normalizado,
      marca: normalizacao.marca,
      tipo_embalagem: normalizacao.tipo_embalagem,
      qtd_valor: normalizacao.qtd_valor,
      qtd_unidade: normalizacao.qtd_unidade,
      qtd_base: normalizacao.qtd_base,
      granel: normalizacao.granel || false,
      produto_hash_normalizado: normalizacao.produto_hash || await gerarHashSKU({
        nome_base: normalizacao.nome_base || normalizacao.nome_normalizado,
        marca: normalizacao.marca,
        qtd_base: normalizacao.qtd_base,
        qtd_unidade: normalizacao.qtd_unidade,
        tipo_embalagem: normalizacao.tipo_embalagem,
        granel: normalizacao.granel || false
      }),
      origem: 'manual'
    };
  }

  return null;
}

async function processarComIA2(openaiApiKey: string, nomeOriginal: string, debug: boolean) {
  const prompt = `Você é o IA-2, motor de normalização de produtos do Picotinho. Sua função é transformar descrições brutas de notas fiscais em produtos padronizados e consistentes.

ENTRADA: "${nomeOriginal}"

REGRAS OBRIGATÓRIAS:

1. EXPANSÃO DE ABREVIAÇÕES:
   - PC/PCT → PACOTE
   - BDJ → BANDEJA  
   - K → KG
   - LT/L → LITRO
   - UN/UND/UNID → UNIDADE
   - FILE → FILÉ
   - FRGO → FRANGO
   - SAB → SABÃO
   - DETERG → DETERGENTE
   - E todas as outras abreviações comuns

2. ESTRUTURA DO NOME CANÔNICO (ordem obrigatória):
   PRODUTO BASE + MARCA + EMBALAGEM/QUANTIDADE/UNIDADE + EXTRAS

   Exemplos:
   - "FILE PEITO BDJ SEARA 1K" → "FILÉ DE PEITO SEARA BANDEJA 1 KG"
   - "COCA-COLA 1,250LT" → "COCA-COLA 1,25 LITRO"
   - "IP SAB PÓ 2KG" → "SABÃO EM PÓ IP PACOTE 2 KG"
   - "TEMPERO VERDE 1 UNIDADE" → "TEMPERO VERDE 1 UNIDADE"
   - "MILHO VERDE PREDILETO 170 G LATA" → "MILHO VERDE PREDILETO 170 G LATA"

3. PRESERVAÇÃO CRÍTICA:
   - NUNCA remover peso/volume da embalagem (170G, 1KG, 2L, etc.)
   - NUNCA colocar quantidade comprada no nome
   - NUNCA alterar marcas (manter Seara, Predileto, Coca-Cola, etc.)
   - SEMPRE manter informações da embalagem original

4. CATEGORIZAÇÃO (use apenas estas 11):
   - HORTIFRUTI (frutas, verduras, legumes)
   - BEBIDAS (refrigerantes, sucos, águas)
   - MERCEARIA (grãos, temperos, enlatados, molhos)
   - AÇOUGUE (carnes frescas, embutidos)
   - PADARIA (pães, bolos, biscoitos)
   - LATICÍNIOS/FRIOS (leite, queijo, iogurte, manteiga)
   - LIMPEZA (detergente, sabão, desinfetante)
   - HIGIENE/FARMÁCIA (shampoo, sabonete, remédios)
   - CONGELADOS (sorvetes, carnes congeladas)
   - PET (ração, acessórios para animais)
   - OUTROS (apenas em último caso)

5. DETECÇÃO DE QUANTIDADE/UNIDADE:
   - Identifique peso/volume da EMBALAGEM (não quantidade comprada)
   - Converta para unidades base: g/ml para qtd_base
   - 1KG = 1000g, 1L = 1000ml, 1UN = 1

6. DETECÇÃO DE GRANEL:
   - Identifique se produto é vendido a granel
   - Palavras-chave: "GRANEL", "A GRANEL"

RETORNE APENAS JSON VÁLIDO:

{
  "produto_nome_normalizado": "NOME COMPLETO EXPANDIDO E PADRONIZADO",
  "nome_base": "PRODUTO SEM MARCA/EMBALAGEM/PESO",
  "marca": "MARCA DETECTADA OU null",
  "tipo_embalagem": "BANDEJA/PACOTE/LATA/etc OU null",
  "qtd_valor": 1.5,
  "qtd_unidade": "KG/G/L/ML/UN",
  "qtd_base": 1500,
  "granel": false,
  "categoria": "CATEGORIA_FIXA"
}

Processe: "${nomeOriginal}"`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Você é o IA-2, especialista em normalização de produtos de supermercado. Retorne APENAS JSON válido, sem explicações.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 800
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API falhou: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const respostaIA = data.choices[0]?.message?.content || '';

  if (debug) {
    console.log(`[IA-2] Resposta OpenAI: ${respostaIA}`);
  }

  // Extrair JSON da resposta
  const jsonMatch = respostaIA.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('IA retornou resposta inválida (sem JSON)');
  }

  try {
    const resultado = JSON.parse(jsonMatch[0]);
    
    // Validação obrigatória
    if (!resultado.produto_nome_normalizado) {
      throw new Error('IA não retornou produto_nome_normalizado');
    }

    // Normalizar categoria para lista fixa
    const categoriasValidas = [
      'HORTIFRUTI', 'BEBIDAS', 'MERCEARIA', 'AÇOUGUE', 'PADARIA',
      'LATICÍNIOS/FRIOS', 'LIMPEZA', 'HIGIENE/FARMÁCIA', 'CONGELADOS', 'PET', 'OUTROS'
    ];
    
    if (!categoriasValidas.includes(resultado.categoria)) {
      resultado.categoria = 'OUTROS';
    }

    // Garantir campos obrigatórios
    resultado.nome_base = resultado.nome_base || resultado.produto_nome_normalizado;
    resultado.qtd_base = resultado.qtd_base || (resultado.qtd_valor || 1);
    resultado.granel = Boolean(resultado.granel);

    return resultado;

  } catch (parseError) {
    throw new Error(`Erro ao parsear JSON da IA: ${parseError.message}`);
  }
}

async function gerarHashSKU(dados: any): Promise<string> {
  // Hash determinístico baseado nos campos únicos do produto
  const chaveSKU = [
    dados.nome_base || '',
    dados.marca || '',
    dados.qtd_base || 1,
    dados.qtd_unidade || 'UN',
    dados.tipo_embalagem || '',
    dados.granel ? 'GRANEL' : ''
  ].join('|').toUpperCase();

  const encoder = new TextEncoder();
  const data = encoder.encode(chaveSKU);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}