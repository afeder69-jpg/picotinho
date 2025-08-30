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
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY não configurada');
    }

    const { productName } = await req.json();
    
    if (!productName) {
      throw new Error('Nome do produto é obrigatório');
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em categorização de produtos de supermercado. 
            Categorize o produto fornecido em uma das seguintes categorias EXATAS (responda apenas com o nome da categoria):
            
            - hortifruti
            - laticínios
            - mercearia
            - bebidas
            - limpeza
            - higiene
            - padaria
            - carnes
            - outros
            
            Responda APENAS com o nome da categoria, sem explicações.`
          },
          {
            role: 'user',
            content: `Categorize este produto: ${productName}`
          }
        ],
        temperature: 0.1,
        max_tokens: 50
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API Perplexity: ${response.status}`);
    }

    const data = await response.json();
    const category = data.choices[0].message.content.trim().toLowerCase();
    
    // Validar se a categoria está na lista permitida
    const validCategories = ['hortifruti', 'laticínios', 'mercearia', 'bebidas', 'limpeza', 'higiene', 'padaria', 'carnes', 'outros'];
    const finalCategory = validCategories.includes(category) ? category : 'outros';

    return new Response(JSON.stringify({ category: finalCategory }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro ao categorizar produto:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      category: 'outros' // fallback
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});