import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProdutoNormalizado {
  id: string;
  produto_nome: string;
  produto_nome_normalizado: string;
  produto_hash_normalizado: string;
  categoria: string;
  marca: string;
  nome_base: string;
  created_at: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { produtoNome, userId } = await req.json();

    console.log(`🔍 [SMART MATCHER] Iniciando para: "${produtoNome}"`);

    // 1. BUSCAR PRODUTOS SIMILARES JÁ NORMALIZADOS
    const { data: produtosExistentes, error: errorBusca } = await supabase
      .from('estoque_app')
      .select('id, produto_nome, produto_nome_normalizado, produto_hash_normalizado, categoria, marca, nome_base')
      .eq('user_id', userId)
      .not('produto_nome_normalizado', 'is', null)
      .not('produto_hash_normalizado', 'is', null)
      .limit(1000);

    if (errorBusca) {
      console.error('❌ Erro ao buscar produtos:', errorBusca);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar produtos existentes' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Encontrados ${produtosExistentes?.length || 0} produtos normalizados para comparar`);

    if (!produtosExistentes || produtosExistentes.length === 0) {
      console.log('🆕 Nenhum produto normalizado encontrado - chamando IA-2 para criar novo');
      const novoProduto = await chamarIA2ParaCriarNovo(produtoNome, supabase, openaiApiKey);
      
      return new Response(JSON.stringify({
        success: true,
        matched: false,
        produto: novoProduto
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. USAR IA PARA FAZER MATCHING INTELIGENTE
    const produtoSimilar = await encontrarProdutoSimilarComIA(
      produtoNome, 
      produtosExistentes, 
      openaiApiKey
    );

    if (produtoSimilar) {
      console.log(`✅ [MATCH ENCONTRADO] "${produtoNome}" → "${produtoSimilar.produto_nome}"`);
      return new Response(JSON.stringify({
        success: true,
        matched: true,
        produto: produtoSimilar
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. NÃO ENCONTROU SIMILAR - CRIAR NOVO COM IA-2
    console.log('🆕 Nenhum produto similar encontrado - criando novo com IA-2');
    const novoProduto = await chamarIA2ParaCriarNovo(produtoNome, supabase, openaiApiKey);
    
    return new Response(JSON.stringify({
      success: true,
      matched: false,
      produto: novoProduto
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function encontrarProdutoSimilarComIA(
  produtoNovo: string, 
  produtosExistentes: any[], 
  openaiApiKey: string
): Promise<any | null> {
  
  const prompt = `Você é um especialista em identificar produtos alimentícios idênticos, mesmo com pequenas diferenças na descrição.

PRODUTO NOVO: "${produtoNovo}"

PRODUTOS EXISTENTES NO SISTEMA:
${produtosExistentes.map((p, i) => `${i + 1}. "${p.produto_nome}"`).join('\n')}

REGRAS CRÍTICAS:
- "Creme Leite" = "Creme de Leite" (SÃO IGUAIS)
- "Chá Mate" = "Chá Pronto" (SÃO IGUAIS se mesma marca)
- Variações de embalagem: "200g", "200 g", "200gr" (SÃO IGUAIS)
- Ordem das palavras pode variar: "Leão Natural 1,5L" = "Natural Leão 1,5L"
- Marcas: considere variações como "Matte Leão" = "Leão"
- Ignore: artigos (de, da, do), conectores (e, com, para)

CASOS QUE SÃO O MESMO PRODUTO:
- "Creme Leite Italac 200g" ↔ "Creme de Leite Italac 200g"
- "Chá Mate Matte Leão Natural 1,5L" ↔ "Chá Pronto Matte Leão 1,5L Natural"
- "Leite Integral Piracanjuba 1L" ↔ "Leite Integral 1L Piracanjuba"

Se encontrar um produto IDÊNTICO, responda apenas o NÚMERO do produto (1, 2, 3...).
Se NÃO encontrar produto idêntico, responda apenas: "NENHUM"`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um especialista em identificar produtos idênticos.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      console.error('❌ Erro na API OpenAI:', response.status);
      return null;
    }

    const data = await response.json();
    const resposta = data.choices[0].message.content.trim();
    
    console.log(`🤖 IA Resposta: "${resposta}"`);

    if (resposta === 'NENHUM') {
      return null;
    }

    // Tentar extrair o número da resposta
    const numeroMatch = resposta.match(/(\d+)/);
    if (numeroMatch) {
      const indice = parseInt(numeroMatch[1]) - 1;
      if (indice >= 0 && indice < produtosExistentes.length) {
        console.log(`🎯 Match encontrado: índice ${indice} → "${produtosExistentes[indice].produto_nome}"`);
        return produtosExistentes[indice];
      }
    }

    return null;

  } catch (error) {
    console.error('❌ Erro ao chamar IA:', error);
    return null;
  }
}

async function chamarIA2ParaCriarNovo(
  produtoNome: string, 
  supabase: any, 
  openAIApiKey?: string
): Promise<any> {
  try {
    console.log(`🆕 Criando novo produto normalizado para: "${produtoNome}"`);
    
    const { data, error } = await supabase.functions.invoke('normalizar-produto-ia2', {
      body: { descricao: produtoNome }
    });

    if (error) {
      console.error('❌ Erro ao chamar IA-2:', error);
      
      // Fallback robusto
      return {
        produto_nome_normalizado: produtoNome.toUpperCase().trim(),
        nome_base: produtoNome.toUpperCase().trim(),
        marca: null,
        categoria: 'outros',
        tipo_embalagem: null,
        qtd_valor: null,
        qtd_unidade: null,
        qtd_base: null,
        granel: false,
        produto_hash_normalizado: await gerarHashSimples(produtoNome)
      };
    }

    return data;

  } catch (error) {
    console.error('❌ Erro ao criar novo produto:', error);
    
    // Fallback final
    return {
      produto_nome_normalizado: produtoNome.toUpperCase().trim(),
      nome_base: produtoNome.toUpperCase().trim(),
      marca: null,
      categoria: 'outros',
      tipo_embalagem: null,
      qtd_valor: null,
      qtd_unidade: null,
      qtd_base: null,
      granel: false,
      produto_hash_normalizado: await gerarHashSimples(produtoNome)
    };
  }
}

async function gerarHashSimples(nome: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nome.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}