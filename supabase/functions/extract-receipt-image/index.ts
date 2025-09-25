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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
    
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { imagemId, notaImagemId, userId } = await req.json();
    
    const finalNotaId = imagemId || notaImagemId;
    
    if (!finalNotaId) {
      throw new Error('ID da nota é obrigatório');
    }

    console.log(`🖼️ EXTRAÇÃO DE IMAGEM - Iniciando para nota_id=${finalNotaId}`);

    // Buscar nota
    const { data: nota, error: notaError } = await supabase
      .from("notas_imagens")
      .select("id, usuario_id, imagem_url, dados_extraidos")
      .eq("id", finalNotaId)
      .single();

    if (notaError || !nota) {
      throw new Error("Nota não encontrada");
    }

    if (!nota.imagem_url) {
      throw new Error("URL da imagem não encontrada");
    }

    console.log(`🔍 Processando imagem: ${nota.imagem_url}`);

    // Prompt para extração completa de dados de notas fiscais com categorização aprimorada
    const extractionPrompt = `Você é um especialista em análise de notas fiscais brasileiras. Analise esta imagem de nota fiscal e extraia TODOS os dados estruturados em JSON.

REGRAS CRÍTICAS DE CATEGORIZAÇÃO:

1. Use EXATAMENTE estas categorias (em minúsculas):
   - hortifruti: frutas, verduras, legumes, temperos verdes, ervas frescas
   - mercearia: arroz, feijão, massas, sal, açúcar, óleo, azeite, ovos, milho (enlatado), aveia, conservas, molhos
   - bebidas: refrigerantes, sucos, água, cervejas, vinhos, energéticos (exceto leite)
   - laticínios/frios: leite, queijos, iogurtes, manteiga, requeijão, embutidos, presunto, mortadela
   - limpeza: detergentes, sabões, desinfetantes, esponja de aço, bombril, amaciantes
   - higiene/farmácia: sabonetes, shampoos, pasta de dente, papel higiênico, medicamentos
   - açougue: carnes frescas, frango, peixes, linguiças
   - padaria: pães, bolos, biscoitos, torradas
   - congelados: sorvetes, produtos congelados, pizzas congeladas
   - pet: rações, produtos para animais
   - outros: apenas quando não se encaixa em nenhuma categoria acima

2. CATEGORIZAÇÃO ESPECÍFICA (OBRIGATÓRIA):
   - "Tempero Verde" ou similar → "hortifruti"
   - "Milho Verde" (lata/conserva) → "mercearia"
   - "Esponja de Aço" ou "Bombril" → "limpeza"
   - Qualquer tipo de "Massa" ou "Macarrão" → "mercearia"
   - "Sal" de qualquer tipo → "mercearia"
   - "Aveia" → "mercearia"
   - "Azeite" → "mercearia"
   - "Ovos" → "mercearia"

3. ESTRUTURA OBRIGATÓRIA DO JSON:
{
  "estabelecimento": {
    "nome": "Nome do estabelecimento",
    "cnpj": "CNPJ normalizado",
    "endereco": "Endereço completo"
  },
  "compra": {
    "valor_total": 0.00,
    "forma_pagamento": "forma de pagamento",
    "data_emissao": "YYYY-MM-DD",
    "hora_emissao": "HH:MM:SS",
    "chave_acesso": "44 dígitos se encontrada ou null"
  },
  "itens": [
    {
      "descricao": "Nome limpo do produto",
      "codigo": "código se disponível",
      "quantidade": 1.0,
      "unidade": "UN/KG/L etc",
      "valor_unitario": 0.00,
      "valor_total": 0.00,
      "categoria": "categoria_obrigatoria"
    }
  ]
}

4. REGRAS DE LIMPEZA DE NOMES:
   - Preserve marcas originais (Nescau, Bombril, etc.)
   - Remova códigos de barras
   - Mantenha peso/volume da embalagem (500g, 1L, etc.)
   - Capitalize adequadamente
   - Não inclua quantidade comprada na descrição

5. VALIDAÇÕES:
   - TODOS os itens DEVEM ter categoria
   - Nunca deixe categoria vazia ou null
   - Use "outros" APENAS em último caso
   - Extraia TODOS os produtos visíveis

Retorne APENAS o JSON válido, sem explicações.`;

    // Chamar OpenAI Vision
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: extractionPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia todos os dados desta nota fiscal seguindo as regras de categorização:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: nota.imagem_url
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      }),
    });

    if (!openaiResponse.ok) {
      throw new Error(`Erro na API OpenAI: ${openaiResponse.status}`);
    }

    const openaiResult = await openaiResponse.json();
    const responseText = openaiResult.choices[0]?.message?.content || '{}';
    
    console.log('🤖 Resposta da IA:', responseText.substring(0, 500) + '...');

    let dadosExtraidos;
    try {
      // Limpar resposta e fazer parse do JSON
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      dadosExtraidos = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('❌ Erro ao fazer parse do JSON:', parseError);
      throw new Error('Resposta da IA não é um JSON válido');
    }

    // Validar estrutura básica
    if (!dadosExtraidos.itens || !Array.isArray(dadosExtraidos.itens)) {
      throw new Error('Estrutura de dados inválida - itens não encontrados');
    }

    // Garantir que todos os itens tenham categoria
    dadosExtraidos.itens = dadosExtraidos.itens.map((item: any) => ({
      ...item,
      categoria: item.categoria || 'outros'
    }));

    console.log(`✅ Extraídos ${dadosExtraidos.itens.length} itens com categorização`);

    // Salvar dados extraídos na nota
    const { error: updateError } = await supabase
      .from("notas_imagens")
      .update({ 
        dados_extraidos: dadosExtraidos,
        debug_texto: 'EXTRAÇÃO_IMAGEM_CONCLUÍDA'
      })
      .eq("id", finalNotaId);

    if (updateError) {
      throw new Error(`Erro ao salvar dados extraídos: ${updateError.message}`);
    }

    // ✅ FLUXO AUTOMÁTICO: IA-1 → IA-2
    console.log("🚀 IA-1 finalizou extração, disparando IA-2 automaticamente...");
    
    // Executar IA-2 em background após salvar os dados
    // Process in background (EdgeRuntime not available in this context)
    setTimeout(() => {
      supabase.functions.invoke('process-receipt-full', {
        body: { imagemId: finalNotaId }
      }).then((result) => {
        console.log("✅ IA-2 executada automaticamente com sucesso:", result);
      }).catch((estoqueErr) => {
        console.error("❌ Falha na execução automática da IA-2:", estoqueErr);
      })
    }, 0);

    return new Response(JSON.stringify({
      success: true,
      nota_id: finalNotaId,
      itens_extraidos: dadosExtraidos.itens.length,
      dados_extraidos: dadosExtraidos
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Erro na extração de imagem:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});