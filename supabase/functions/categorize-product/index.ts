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
            
            1. Categorizar o produto em uma das categorias EXATAS seguindo este mapa de normalização:
            
            HORTIFRUTI: frutas, verduras, legumes, hortaliças, hortifruti, ervas, temperos naturais, temperos verdes
            - Entradas possíveis: Frutas, Verduras, Legumes, Hortaliças, Hortifruti, Temperos verdes
            - Exemplos: banana, maçã, alface, tomate, cebola, batata, limão, fruta de conde, pinha, mamão, abacaxi, cenoura, beterraba, abobrinha, tempero verde, cheiro verde, salsa, cebolinha, manjericão, coentro
            
            BEBIDAS: refrigerantes, sucos, água, cerveja, vinhos, destilados, bebidas (exceto leite)
            - Entradas possíveis: Refrigerantes, Sucos, Água, Cerveja, Vinhos, Destilados, Bebidas
            - Exemplos: refrigerante, suco, cerveja, água, energético, vinho, cachaça, whisky, vodka
            
            MERCEARIA: arroz, feijão, macarrão, açúcar, sal, óleo, café, grãos, cereais, massas, conservas, condimentos, milho, aveia, azeite, ovos
            - Entradas possíveis: Arroz, Feijão, Macarrão, Açúcar, Sal, Óleo, Café, Mercearia, Milho, Aveia, Azeite, Ovos
            - Exemplos: arroz, feijão, macarrão, óleo, açúcar, café, farinha, molho de tomate, extrato de tomate, vinagre, milho verde, aveia, azeite extra virgem, ovos, massa com ovos, sal refinado
            
            AÇOUGUE: açougue, carnes, frango, peixe, suínos, aves, carnes frescas
            - Entradas possíveis: Açougue, Carnes, Frango, Peixe, Suínos
            - Exemplos: carne bovina, frango, peixe, linguiça, salsicha, carne suína, picanha
            
            PADARIA: pães, bolos, salgados, padaria, biscoitos
            - Entradas possíveis: Pães, Bolos, Salgados, Padaria
            - Exemplos: pão de forma, pão francês, bolo, biscoito, torrada, rosquinha, croissant
            
            LATICÍNIOS/FRIOS: laticínios, frios, queijos, leite, iogurte, embutidos, derivados do leite
            - Entradas possíveis: Laticínios, Frios, Queijos, Leite, Iogurte
            - Exemplos: leite, queijo, manteiga, margarina, iogurte, requeijão, creme de leite, presunto, mortadela, salame
            
            LIMPEZA: detergente, sabão, desinfetante, amaciante, produtos de limpeza doméstica, esponja de aço
            - Entradas possíveis: Detergente, Sabão, Desinfetante, Amaciante, Produtos de Limpeza, Esponja, Esponja de Aço
            - Exemplos: detergente, sabão em pó, desinfetante, água sanitária, amaciante, alvejante, esponja de aço bombril, esponja dupla face, palha de aço
            
            HIGIENE/FARMÁCIA: higiene, farmácia, sabonete, shampoo, creme dental, medicamentos, produtos de higiene pessoal
            - Entradas possíveis: Higiene, Farmácia, Sabonete, Shampoo, Creme dental, Medicamentos
            - Exemplos: sabonete, shampoo, pasta de dente, desodorante, papel higiênico, medicamentos, vitaminas
            
            CONGELADOS: congelados, salgadinhos congelados, peixes congelados, pratos prontos congelados
            - Entradas possíveis: Congelados, Salgadinhos congelados, Peixes congelados, Pratos prontos congelados
            - Exemplos: sorvete, batata frita congelada, nuggets, pizza congelada, hambúrguer congelado, peixe congelado
            
            PET: pet, ração, areia de gato, acessórios pet, produtos para animais
            - Entradas possíveis: Pet, Ração, Areia de gato, Acessórios pet
            - Exemplos: ração para cães, ração para gatos, petiscos para pet, brinquedos para animais, coleira
            
            OUTROS: qualquer outro item não mapeado nas categorias acima
            - Entradas possíveis: qualquer item que não se encaixe em nenhuma categoria específica
            
            INSTRUÇÕES ESPECÍFICAS PARA CATEGORIZAÇÃO:
            - "Tempero Verde" ou "Cheiro Verde" → SEMPRE "hortifruti"
            - "Milho Verde" em lata/conserva → SEMPRE "mercearia"
            - "Esponja de Aço" ou "Bombril" → SEMPRE "limpeza"
            - "Massa" qualquer tipo → SEMPRE "mercearia"
            - "Sal" → SEMPRE "mercearia"
            - "Aveia" → SEMPRE "mercearia"
            - "Azeite" → SEMPRE "mercearia"
            - "Ovos" → SEMPRE "mercearia"
            
            2. Sugerir um nome padronizado no estilo de supermercado com estas regras:
            - Primeira letra de cada palavra importante em maiúscula
            - Unidades sempre abreviadas: Kg, L, Un, Pct, G, ML
            - Manter hífens em palavras compostas (ex: Pimenta-do-Reino)
            - Padronizar tipos conhecidos (ex: "agulhinha" → "Tipo 1", "cinco quilos" → "5Kg")
            - Formato profissional de supermercado
            - SEMPRE sugerir melhorias mesmo que o nome pareça correto
            
            IMPORTANTE: Use EXATAMENTE uma das 11 categorias fixas do mapa de normalização:
            "hortifruti", "bebidas", "mercearia", "açougue", "padaria", "laticínios/frios", "limpeza", "higiene/farmácia", "congelados", "pet", "outros"
            
            Exemplos de padronização:
            - "arroz agulhinha cinco quilos" → Categoria: "mercearia", Nome: "Arroz Tipo 1 5Kg"
            - "fruta de conde" → Categoria: "hortifruti", Nome: "Fruta-de-Conde"
            - "detergente liquido clear" → Categoria: "limpeza", Nome: "Detergente Líquido Clear"
            - "pao de forma wickbold" → Categoria: "padaria", Nome: "Pão de Forma Wickbold"
            - "carne bovina" → Categoria: "açougue", Nome: "Carne Bovina"
            
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
  } catch (error: any) {
    console.error('Erro ao categorizar produto:', error);
    const { productName } = await req.json().catch(() => ({ productName: 'Produto' }));
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error),
      category: 'outros', // fallback
      suggestedName: productName // fallback
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});