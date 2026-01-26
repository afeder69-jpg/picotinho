import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      throw new Error('OpenAI API key não configurada');
    }

    const { image_base64 } = await req.json();

    if (!image_base64) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Imagem base64 não fornecida'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('📸 [EXTRACT-URL] Iniciando extração de URL da foto...');

    // Garantir que a imagem tenha o prefixo correto
    let imageUrl = image_base64;
    if (!image_base64.startsWith('data:image')) {
      imageUrl = `data:image/jpeg;base64,${image_base64}`;
    }

    const extractUrlPrompt = `Você é um especialista em extrair URLs de imagens de documentos fiscais brasileiros.
Analise esta imagem e encontre QUALQUER URL de consulta de nota fiscal.

Procure por:
- URLs que começam com "https://" ou "http://"
- Endereços de consulta DANFE/NFe/NFCe
- Links da Fazenda, SEFAZ ou portais de nota fiscal
- URLs que contêm palavras como: consultadfe, nfce, danfe, fazenda, sefaz

Se encontrar uma URL válida, retorne APENAS a URL completa.
Se não encontrar nenhuma URL, retorne EXATAMENTE: NOT_FOUND

IMPORTANTE: 
- Retorne APENAS a URL, sem explicações ou texto adicional
- Se houver múltiplas URLs, retorne a que parece ser de consulta fiscal
- Corrija possíveis erros de OCR (O→0, I→1, l→1)
- Se a URL estiver quebrada em múltiplas linhas, junte-as`;

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
            content: extractUrlPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia a URL de consulta de nota fiscal desta imagem:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 500
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ [EXTRACT-URL] Erro OpenAI:', openaiResponse.status, errorText);
      throw new Error(`Erro OpenAI: ${openaiResponse.status}`);
    }

    const openaiResult = await openaiResponse.json();
    const extractedText = openaiResult.choices[0]?.message?.content?.trim() || '';

    console.log('🔍 [EXTRACT-URL] Texto extraído:', extractedText);

    // Verificar se encontrou uma URL válida
    if (extractedText === 'NOT_FOUND' || !extractedText) {
      console.log('⚠️ [EXTRACT-URL] Nenhuma URL encontrada na imagem');
      return new Response(JSON.stringify({
        success: false,
        error: 'Nenhuma URL de consulta encontrada na imagem. Tente tirar uma foto mais nítida da URL impressa.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validar se parece uma URL válida
    const urlPattern = /^https?:\/\/.+/i;
    if (!urlPattern.test(extractedText)) {
      console.log('⚠️ [EXTRACT-URL] Texto extraído não é uma URL válida:', extractedText);
      return new Response(JSON.stringify({
        success: false,
        error: 'O texto encontrado não parece ser uma URL válida. Tente tirar uma foto mais nítida.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Limpar a URL (remover espaços e caracteres inválidos)
    const cleanUrl = extractedText.replace(/\s+/g, '').trim();

    console.log('✅ [EXTRACT-URL] URL extraída com sucesso:', cleanUrl);

    return new Response(JSON.stringify({
      success: true,
      url: cleanUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ [EXTRACT-URL] Erro:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Erro ao processar imagem'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
