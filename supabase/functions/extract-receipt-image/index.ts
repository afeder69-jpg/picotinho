import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para processar itens com IA3
async function processarItensComIA3(itens: any[], usuarioId: string, notaId: string, supabase: any) {
  console.log(`🔄 Processando ${itens.length} itens com IA3...`);
  
  for (const item of itens) {
    try {
      console.log(`🎯 IA3 processando: ${item.descricao}`);
      
      // Chamar IA3 para normalizar o item
      const { data: resultadoIA3, error: erroIA3 } = await supabase.functions.invoke('normalizar-produto-ia3', {
        body: {
          produto_nome: item.descricao,
          usuario_id: usuarioId
        }
      });
      
      if (erroIA3) {
        console.error(`❌ Erro IA3 para "${item.descricao}":`, erroIA3);
        continue;
      }
      
      console.log(`✅ IA3 processou "${item.descricao}" → "${resultadoIA3.resultado.nome_normalizado}" (${resultadoIA3.resultado.acao})`);
      
      // Se foi aceito automaticamente, atualizar estoque
      if (resultadoIA3.resultado.acao === 'aceito_automatico') {
        await adicionarAoEstoque(item, resultadoIA3.resultado, usuarioId, notaId, supabase);
      }
      
    } catch (error) {
      console.error(`❌ Erro ao processar item "${item.descricao}" com IA3:`, error);
    }
  }
  
  console.log(`✅ Processamento IA3 concluído para nota ${notaId}`);
}

// Função para adicionar ao estoque
async function adicionarAoEstoque(itemNota: any, resultadoIA3: any, usuarioId: string, notaId: string, supabase: any) {
  try {
    const { error } = await supabase
      .from('estoque_app')
      .insert({
        user_id: usuarioId,
        nota_id: notaId,
        produto_nome: resultadoIA3.nome_normalizado,
        produto_nome_normalizado: resultadoIA3.nome_normalizado,
        nome_base: resultadoIA3.nome_normalizado,
        marca: resultadoIA3.marca,
        categoria: resultadoIA3.categoria,
        quantidade: itemNota.quantidade || 1,
        unidade_medida: resultadoIA3.unidade || 'UN',
        preco_unitario_ultimo: itemNota.valor_unitario || 0,
        origem: 'nota_fiscal_ia3',
        tipo_embalagem: null,
        qtd_valor: null,
        qtd_unidade: resultadoIA3.quantidade,
        qtd_base: null,
        granel: false,
        produto_hash_normalizado: resultadoIA3.sku || null
      });
    
    if (error) {
      console.error(`❌ Erro ao adicionar "${resultadoIA3.nome_normalizado}" ao estoque:`, error);
    } else {
      console.log(`✅ Adicionado ao estoque: ${resultadoIA3.nome_normalizado} (${itemNota.quantidade} ${resultadoIA3.unidade})`);
    }
  } catch (error) {
    console.error(`❌ Erro ao inserir no estoque:`, error);
  }
}

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

    // Prompt da IA2 - APENAS EXTRAÇÃO (sem normalização)
    const extractionPrompt = `Você é um especialista em análise de notas fiscais brasileiras. Analise esta imagem de nota fiscal e extraia TODOS os dados estruturados em JSON.

⚠️ Regra obrigatória: 
Você NÃO pode inventar, criar ou alterar dados que não estejam presentes de forma explícita no documento ou entrada fornecida. 
Se não encontrar a informação, retorne null (ou campo vazio permitido). 
Nunca crie notas, itens, valores, produtos ou estabelecimentos fictícios. 
Seu papel é apenas interpretar e estruturar os dados existentes, nunca gerar informações novas.

IMPORTANTE: Sua função é APENAS extrair os dados como estão na nota. NÃO normalize ou padronize nomes de produtos.

ESTRUTURA OBRIGATÓRIA DO JSON:
{
  "estabelecimento": {
    "nome": "Nome do estabelecimento EXATAMENTE como aparece",
    "cnpj": "CNPJ normalizado (apenas números)",
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
      "descricao": "Nome do produto EXATAMENTE como aparece na nota",
      "codigo": "código se disponível",
      "quantidade": 1.0,
      "unidade": "UN/KG/L etc como aparece",
      "valor_unitario": 0.00,
      "valor_total": 0.00
    }
  ]
}

REGRAS DE EXTRAÇÃO:
- Extraia os nomes dos produtos EXATAMENTE como aparecem na nota
- NÃO corrija abreviações (mantenha "cr.", "refrig.", etc.)
- NÃO padronize capitalização
- NÃO remova códigos ou símbolos
- NÃO adicione categorias (isso será feito depois)
- APENAS extraia e estruture os dados brutos

VALIDAÇÕES:
- Extraia TODOS os produtos visíveis
- Mantenha valores numéricos precisos
- Preserve formatação original dos nomes

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

    console.log(`✅ Extraídos ${dadosExtraidos.itens.length} itens (sem normalização)`);

    // Salvar dados extraídos na nota
    const { error: updateError } = await supabase
      .from("notas_imagens")
      .update({ 
        dados_extraidos: dadosExtraidos,
        debug_texto: 'IA2_EXTRACAO_CONCLUIDA'
      })
      .eq("id", finalNotaId);

    if (updateError) {
      throw new Error(`Erro ao salvar dados extraídos: ${updateError.message}`);
    }

    // ✅ FLUXO NOVO: IA2 → IA3 (com feature flag)
    console.log("🚀 IA2 finalizou extração, verificando se deve chamar IA3...");
    
    // Verificar feature flag para IA3
    const { data: featureFlag } = await supabase
      .from('configuracoes_usuario')
      .select('*')
      .eq('usuario_id', nota.usuario_id)
      .single();
    
    const usarIA3 = true; // Por enquanto sempre true, depois será uma feature flag
    
    if (usarIA3) {
      console.log("🎯 Feature flag IA3 ativa - processando itens com IA3...");
      
      // Executar IA3 para cada item em background
      processarItensComIA3(dadosExtraidos.itens, nota.usuario_id, finalNotaId, supabase)
        .catch(error => console.error("❌ Erro no processamento IA3:", error));
    } else {
      console.log("⏸️ Feature flag IA3 desativa - usando fluxo antigo...");
      // Manter fluxo antigo se necessário
    }

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