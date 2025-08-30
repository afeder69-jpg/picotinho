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
            content: `Você é um especialista em produtos de supermercado. Sua tarefa é:
            
            1. Categorizar o produto em uma das categorias EXATAS:
            - hortifruti
            - laticínios  
            - mercearia
            - bebidas
            - limpeza
            - higiene
            - padaria
            - carnes
            - outros
            
            2. Sugerir um nome padronizado no estilo de nota fiscal de supermercado.
            
            Regras para o nome padronizado:
            - Primeira letra de cada palavra importante maiúscula
            - Manter hífens em palavras compostas (ex: Pimenta-do-Reino)
            - Preservar marcas e especificações técnicas
            - Formato limpo e profissional
            
            Responda EXATAMENTE neste formato JSON:
            {"category": "categoria", "suggestedName": "Nome Padronizado"}`
          },
          {
            role: 'user',
            content: `Analise este produto: ${productName}`
          }
        ],
        temperature: 0.1,
        max_tokens: 150
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API Perplexity: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content.trim();
    
    let category = 'outros';
    let suggestedName = productName;
    
    try {
      // Tentar fazer parse do JSON
      const parsed = JSON.parse(responseText);
      if (parsed.category && parsed.suggestedName) {
        category = parsed.category.toLowerCase();
        suggestedName = parsed.suggestedName;
      }
    } catch (error) {
      // Se não conseguir fazer parse, extrair categoria manualmente
      const categoryMatch = responseText.toLowerCase().match(/"category":\s*"([^"]+)"/);
      const nameMatch = responseText.match(/"suggestedName":\s*"([^"]+)"/);
      
      if (categoryMatch) category = categoryMatch[1];
      if (nameMatch) suggestedName = nameMatch[1];
    }
    
    // Validar se a categoria está na lista permitida
    const validCategories = ['hortifruti', 'laticínios', 'mercearia', 'bebidas', 'limpeza', 'higiene', 'padaria', 'carnes', 'outros'];
    const finalCategory = validCategories.includes(category) ? category : 'outros';

    return new Response(JSON.stringify({ 
      category: finalCategory,
      suggestedName: suggestedName 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro ao categorizar produto:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      category: 'outros', // fallback
      suggestedName: productName // fallback
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});