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
            
            1. Categorizar o produto em uma das categorias EXATAS seguindo estas regras:
            
            HORTIFRUTI: frutas, verduras, legumes, ervas, temperos naturais
            - Exemplos: banana, maçã, alface, tomate, cebola, batata, limão, fruta de conde, pinha, mamão, abacaxi, cenoura, beterraba, abobrinha, etc.
            
            MERCEARIA: grãos, cereais, massas, conservas, condimentos, óleos, vinagres, açúcar, sal, farinha
            - Exemplos: arroz, feijão, macarrão, óleo, açúcar, café, farinha, molho de tomate, extrato de tomate, vinagre, etc.
            
            LATICÍNIOS/FRIOS: leite e derivados, frios, embutidos
            - Exemplos: leite, queijo, manteiga, margarina, iogurte, requeijão, creme de leite, presunto, mortadela, salame, etc.
            
            BEBIDAS: todas as bebidas exceto leite
            - Exemplos: refrigerante, suco, cerveja, água, energético, vinho, cachaça, etc.
            
            PADARIA: pães, bolos, biscoitos, salgados
            - Exemplos: pão de forma, pão francês, bolo, biscoito, torrada, rosquinha, etc.
            
            LIMPEZA: produtos de limpeza doméstica
            - Exemplos: detergente, sabão em pó, desinfetante, água sanitária, amaciante, etc.
            
            HIGIENE/FARMÁCIA: produtos de higiene pessoal e farmácia
            - Exemplos: sabonete, shampoo, pasta de dente, desodorante, papel higiênico, medicamentos, etc.
            
            AÇOUGUE: carnes frescas, aves, peixes
            - Exemplos: carne bovina, frango, peixe, linguiça, salsicha, etc.
            
            CONGELADOS: produtos congelados
            - Exemplos: sorvete, batata frita congelada, nuggets, pizza congelada, etc.
            
            PET: produtos para animais de estimação
            - Exemplos: ração, petiscos para cães/gatos, brinquedos para pet, etc.
            
            OUTROS: apenas se não se encaixar em NENHUMA das categorias acima
            
            2. Sugerir um nome padronizado no estilo de supermercado com estas regras:
            - Primeira letra de cada palavra importante em maiúscula
            - Unidades sempre abreviadas: Kg, L, Un, Pct, G, ML
            - Manter hífens em palavras compostas (ex: Pimenta-do-Reino)
            - Padronizar tipos conhecidos (ex: "agulhinha" → "Tipo 1", "cinco quilos" → "5Kg")
            - Formato profissional de supermercado
            - SEMPRE sugerir melhorias mesmo que o nome pareça correto
            
            Exemplos de padronização:
            - "arroz agulhinha cinco quilos" → "Arroz Tipo 1 5Kg"
            - "fruta de conde" → "Fruta-de-Conde"
            - "detergente liquido clear" → "Detergente Líquido Clear"
            - "pao de forma wickbold" → "Pão de Forma Wickbold"
            
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
    const validCategories = ['hortifruti', 'bebidas', 'mercearia', 'açougue', 'padaria', 'laticínios/frios', 'limpeza', 'higiene/farmácia', 'congelados', 'pet', 'outros'];
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