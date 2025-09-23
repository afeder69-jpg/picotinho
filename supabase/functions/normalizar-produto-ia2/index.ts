import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProdutoNormalizado {
  produto_nome_normalizado: string;
  nome_base: string;
  marca: string | null;
  categoria: string;
  tipo_embalagem: string | null;
  qtd_valor: number | null;
  qtd_unidade: string | null;
  qtd_base: number | null;
  granel: boolean;
  produto_hash_normalizado: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key não configurada');
    }

    const { descricao } = await req.json();
    
    if (!descricao || typeof descricao !== 'string') {
      throw new Error('Descrição do produto é obrigatória');
    }

    console.log(`🤖 Normalizando produto: "${descricao}"`);

    // Chamar OpenAI para normalização inteligente
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `Você é um especialista em normalização de produtos de supermercado brasileiro. 

REGRAS CRÍTICAS:
1. CHÁ PRONTO ≠ CHÁ MATE - São produtos DIFERENTES!
   - "Chá Mate" = erva para chimarrão
   - "Chá Pronto" = bebida industrializada pronta

2. NORMALIZAÇÃO DE NOMES:
   - Manter marcas originais (Matte Leão, Italac, etc.)
   - Corrigir abreviações: "CHÁ MATE" → "Chá Pronto" (quando for bebida pronta)
   - Adicionar preposições: "CREME LEITE" → "Creme de Leite"
   - Padronizar pesos/volumes: "1,5L", "200g"
   - Capitalização adequada: "Primeira Letra Maiúscula"

3. CATEGORIAS PRECISAS:
   - laticínios/frios: leites, cremes, queijos, iogurtes
   - bebidas: sucos, chás prontos, refrigerantes, águas
   - mercearia: grãos, massas, molhos, temperos
   - hortifruti: frutas, verduras, legumes
   - limpeza: detergentes, sabões, produtos de limpeza
   - higiene: shampoos, sabonetes, desodorantes
   - padaria: pães, bolos, biscoitos
   - açougue: carnes, frangos, peixes
   - congelados: produtos congelados

4. EXTRAIR INFORMAÇÕES:
   - marca: nome da marca se houver
   - tipo_embalagem: "lata", "garrafa", "sachê", "caixa", etc.
   - qtd_valor: número da quantidade
   - qtd_unidade: "g", "ml", "l", "kg", "un"
   - granel: true se vendido por peso

Responda APENAS com JSON válido:`
          },
          {
            role: 'user',
            content: `Normalize este produto: "${descricao}"`
          }
        ],
        temperature: 0.1,
        max_tokens: 800
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API erro: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content.trim();
    
    console.log(`🤖 Resposta IA: ${aiResponse}`);

    let produtoNormalizado: ProdutoNormalizado;
    
    try {
      // Tentar parsear JSON da resposta da IA
      const parsed = JSON.parse(aiResponse);
      
      // Validar e estruturar resposta
      produtoNormalizado = {
        produto_nome_normalizado: parsed.produto_nome_normalizado || descricao.toUpperCase(),
        nome_base: parsed.nome_base || parsed.produto_nome_normalizado || descricao.toUpperCase(),
        marca: parsed.marca || null,
        categoria: validarCategoria(parsed.categoria) || 'outros',
        tipo_embalagem: parsed.tipo_embalagem || null,
        qtd_valor: parsed.qtd_valor ? Number(parsed.qtd_valor) : null,
        qtd_unidade: parsed.qtd_unidade || null,
        qtd_base: parsed.qtd_base ? Number(parsed.qtd_base) : null,
        granel: Boolean(parsed.granel),
        produto_hash_normalizado: await gerarHash(parsed.produto_nome_normalizado || descricao)
      };
      
    } catch (parseError) {
      console.error('❌ Erro ao parsear JSON da IA:', parseError);
      
      // Fallback: normalização básica
      const nomeNormalizado = normalizarNomeBasico(descricao);
      produtoNormalizado = {
        produto_nome_normalizado: nomeNormalizado,
        nome_base: nomeNormalizado,
        marca: extrairMarca(descricao),
        categoria: categorizarBasico(descricao),
        tipo_embalagem: extrairEmbalagem(descricao),
        qtd_valor: extrairQuantidadeValor(descricao),
        qtd_unidade: extrairQuantidadeUnidade(descricao),
        qtd_base: null,
        granel: false,
        produto_hash_normalizado: await gerarHash(nomeNormalizado)
      };
    }

    console.log(`✅ Produto normalizado:`, produtoNormalizado);

    return new Response(JSON.stringify(produtoNormalizado), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro na normalização:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      fallback: true
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Funções auxiliares
function validarCategoria(categoria: string): string {
  const categoriasValidas = [
    'laticínios/frios', 'bebidas', 'mercearia', 'hortifruti', 
    'limpeza', 'higiene', 'padaria', 'açougue', 'congelados', 'outros'
  ];
  return categoriasValidas.includes(categoria?.toLowerCase()) ? categoria.toLowerCase() : 'outros';
}

function normalizarNomeBasico(descricao: string): string {
  let nome = descricao.toUpperCase().trim();
  
  // Correções específicas críticas
  nome = nome.replace(/\bCHA MATE MATTE LEAO\b/gi, 'Chá Pronto Matte Leão');
  nome = nome.replace(/\bCREME LEITE\b/gi, 'Creme de Leite');
  nome = nome.replace(/\bPAO DE FORMA\b/gi, 'Pão de Forma');
  
  // Remover informações desnecessárias
  nome = nome.replace(/\b(FATIADO|INTEGRAL|NATURAL)\b/gi, '');
  nome = nome.replace(/\s+/g, ' ').trim();
  
  return nome;
}

function extrairMarca(descricao: string): string | null {
  const marcas = [
    'Matte Leão', 'Italac', 'Nestlé', 'Danone', 'Parmalat', 'Vigor',
    'Coca-Cola', 'Pepsi', 'Heinz', 'Quaker', 'Knorr'
  ];
  
  for (const marca of marcas) {
    if (descricao.toLowerCase().includes(marca.toLowerCase())) {
      return marca;
    }
  }
  return null;
}

function categorizarBasico(descricao: string): string {
  const desc = descricao.toLowerCase();
  
  if (desc.includes('chá pronto') || desc.includes('suco') || desc.includes('refrigerante')) {
    return 'bebidas';
  }
  if (desc.includes('leite') || desc.includes('creme') || desc.includes('queijo')) {
    return 'laticínios/frios';
  }
  if (desc.includes('detergente') || desc.includes('sabão') || desc.includes('limpeza')) {
    return 'limpeza';
  }
  if (desc.includes('pão') || desc.includes('biscoito') || desc.includes('bolo')) {
    return 'padaria';
  }
  
  return 'outros';
}

function extrairEmbalagem(descricao: string): string | null {
  const embalagens = ['lata', 'garrafa', 'caixa', 'sachê', 'pote', 'pacote'];
  
  for (const embalagem of embalagens) {
    if (descricao.toLowerCase().includes(embalagem)) {
      return embalagem;
    }
  }
  return null;
}

function extrairQuantidadeValor(descricao: string): number | null {
  const match = descricao.match(/(\d+(?:,\d+)?)\s*(g|ml|l|kg)/i);
  if (match) {
    return parseFloat(match[1].replace(',', '.'));
  }
  return null;
}

function extrairQuantidadeUnidade(descricao: string): string | null {
  const match = descricao.match(/\d+(?:,\d+)?\s*(g|ml|l|kg)/i);
  return match ? match[1].toLowerCase() : null;
}

async function gerarHash(texto: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(texto.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}