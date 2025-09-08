import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ValidationRequest {
  notaImagemId: string;
  imageUrl?: string;
  pdfUrl?: string;
  userId: string;
}

interface ValidationResult {
  approved: boolean;
  reason: string;
  shouldDelete: boolean;
  message: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    if (!openaiApiKey) {
      throw new Error('OpenAI API key não configurada');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { notaImagemId, imageUrl, pdfUrl, userId }: ValidationRequest = await req.json();

    console.log('=== IA-1 VALIDAÇÃO INICIADA ===', {
      notaImagemId,
      userId,
      hasImage: !!imageUrl,
      hasPdf: !!pdfUrl
    });

    // Preparar prompt para análise
    const validationPrompt = `
Analise este documento e responda APENAS com um JSON no formato especificado.

VOCÊ DEVE ANALISAR:
1. CHAVE DE ACESSO: Procure por sequência de 44 dígitos (pode ter espaços, pontos, quebras). Normalize: O→0, I/l→1, B→8.
2. TIPO DE DOCUMENTO: Identifique se é NFS-e, Prestação de Serviços, ISS, documento municipal, etc.
3. SETOR DO ESTABELECIMENTO: Nome/descrição do emissor.
4. SINAIS DE COMPRA: Presença de itens com descrição+quantidade+valor OU valor total OU forma de pagamento.

SETORES ACEITOS (varejo de produtos):
- supermercado, hipermercado, mercado, mercadinho, atacadista, atacadão
- assaí, carrefour, extra, dia, guanabara, zona sul, supermarket
- açougue, padaria, hortifruti, sacolão
- farmácia, drogaria, droga(qualquer coisa)
- distribuidora/depósito de alimentos/bebidas
- mantimentos

SETORES REJEITADOS:
- roupas, confecção, moda, calçados
- telefonia, celular, eletro, eletrônicos, móveis
- material de construção, autopeças, oficina
- bicicleta, moto, carro, concessionária

DECISÃO:
- APROVAR se: (Chave 44 dígitos válida) OU (Setor aceito + sinais de compra)
- BLOQUEAR se: NFS-e/serviço OU (setor rejeitado) OU (nem chave nem setor+compra)

Responda APENAS o JSON:
{
  "approved": boolean,
  "reason": "texto_curto",
  "chave_encontrada": "string ou null",
  "setor_inferido": "string",
  "tem_sinais_compra": boolean,
  "eh_nfse": boolean
}`;

    let analysisText = '';
    
    if (pdfUrl) {
      // Para PDF, fazer análise direta via OpenAI Vision (não precisa extrair texto)
      console.log('Analisando PDF via OpenAI Vision:', pdfUrl);
      
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: validationPrompt
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Analise este documento PDF seguindo as instruções. Se conseguir identificar o tipo de documento, formato e conteúdo, responda com o JSON apropriado:'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: pdfUrl
                    }
                  }
                ]
              }
            ],
            max_tokens: 500,
            temperature: 0.1
          }),
        });

        if (!openaiResponse.ok) {
          throw new Error(`OpenAI Error: ${openaiResponse.status} ${openaiResponse.statusText}`);
        }

        const openaiResult = await openaiResponse.json();
        analysisText = openaiResult.choices[0]?.message?.content || '{}';
        
        console.log('OpenAI resposta para PDF:', analysisText);
        
      } catch (pdfError) {
        console.error('Erro ao analisar PDF:', pdfError);
        // Fallback: assumir que é um documento não reconhecido
        analysisText = JSON.stringify({
          approved: false,
          reason: 'erro_analise_pdf',
          chave_encontrada: null,
          setor_inferido: 'desconhecido',
          tem_sinais_compra: false,
          eh_nfse: false
        });
      }
      
    } else if (imageUrl) {
      // Para imagem, análise via visão
      console.log('Analisando imagem via OpenAI Vision:', imageUrl);
      
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: validationPrompt
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Analise esta imagem de documento seguindo as instruções:'
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
            max_tokens: 500,
            temperature: 0.1
          }),
        });

        if (!openaiResponse.ok) {
          throw new Error(`OpenAI Error: ${openaiResponse.status} ${openaiResponse.statusText}`);
        }

        const openaiResult = await openaiResponse.json();
        analysisText = openaiResult.choices[0]?.message?.content || '{}';
        
        console.log('OpenAI resposta para imagem:', analysisText);
        
      } catch (imageError) {
        console.error('Erro ao analisar imagem:', imageError);
        // Fallback: assumir que é um documento não reconhecido
        analysisText = JSON.stringify({
          approved: false,
          reason: 'erro_analise_imagem',
          chave_encontrada: null,
          setor_inferido: 'desconhecido',
          tem_sinais_compra: false,
          eh_nfse: false
        });
      }
    } else {
      // Nem PDF nem imagem fornecidos
      analysisText = JSON.stringify({
        approved: false,
        reason: 'arquivo_nao_fornecido',
        chave_encontrada: null,
        setor_inferido: 'desconhecido',
        tem_sinais_compra: false,
        eh_nfse: false
      });
    }

    console.log('Resposta IA análise:', analysisText);

    // Parse da resposta
    let analysis;
    try {
      // Limpar resposta para extrair apenas o JSON
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : analysisText;
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Erro ao parsear resposta da IA:', parseError);
      analysis = {
        approved: false,
        reason: 'erro_analise',
        chave_encontrada: null,
        setor_inferido: 'desconhecido',
        tem_sinais_compra: false,
        eh_nfse: false
      };
    }

    console.log('Análise processada:', analysis);

    // Verificar duplicidade se há chave encontrada
    let isDuplicate = false;
    if (analysis.chave_encontrada) {
      // Normalizar chave
      const normalizedKey = analysis.chave_encontrada
        .replace(/[^\d]/g, '') // Remove tudo que não é dígito
        .replace(/O/g, '0')
        .replace(/[Il]/g, '1')
        .replace(/B/g, '8');

      if (normalizedKey.length === 44) {
        console.log('Verificando duplicidade para chave:', normalizedKey.substring(-6)); // Log apenas últimos 6 dígitos

        // Buscar em toda a base (todos os usuários)
        const { data: existingNote } = await supabase
          .from('notas_imagens')
          .select('id')
          .eq('dados_extraidos->>chave_acesso', normalizedKey)
          .limit(1);

        isDuplicate = existingNote && existingNote.length > 0;
      }
    }

    // Determinar resultado final
    let result: ValidationResult;

    if (isDuplicate) {
      result = {
        approved: false,
        reason: 'duplicada',
        shouldDelete: true,
        message: '❌ Esta nota já foi cadastrada no Picotinho.'
      };
    } else if (analysis.eh_nfse) {
      result = {
        approved: false,
        reason: 'nfse',
        shouldDelete: true,
        message: '❌ Este arquivo não é uma nota fiscal de produtos. O Picotinho não aceita esse tipo de documento.'
      };
    } else if (analysis.reason === 'erro_analise_pdf' || analysis.reason === 'erro_analise_imagem') {
      result = {
        approved: false,
        reason: 'erro_analise',
        shouldDelete: true,
        message: '❌ Não foi possível analisar este documento. Verifique se o arquivo está legível e tente novamente.'
      };
    } else if (analysis.reason === 'arquivo_nao_fornecido') {
      result = {
        approved: false,
        reason: 'arquivo_invalido',
        shouldDelete: true,
        message: '❌ Arquivo inválido. Envie uma imagem ou PDF de nota fiscal.'
      };
    } else if (!analysis.approved) {
      result = {
        approved: false,
        reason: analysis.reason || 'criterios_nao_atendidos',
        shouldDelete: true,
        message: '❌ Este arquivo não é uma nota fiscal de produtos. O Picotinho não aceita esse tipo de documento.'
      };
    } else {
      result = {
        approved: true,
        reason: 'aprovada',
        shouldDelete: false,
        message: '✅ Documento aprovado para processamento'
      };
    }

    // Log sem dados sensíveis
    console.log('=== RESULTADO VALIDAÇÃO ===', {
      notaImagemId,
      approved: result.approved,
      reason: result.reason,
      setor: analysis.setor_inferido,
      temSinaisCompra: analysis.tem_sinais_compra,
      chaveUltimos6: analysis.chave_encontrada ? analysis.chave_encontrada.slice(-6) : null,
      isDuplicate
    });

    // Se deve deletar, remover arquivo e registro
    if (result.shouldDelete) {
      // Buscar dados da nota para remover arquivo
      const { data: notaData } = await supabase
        .from('notas_imagens')
        .select('imagem_path')
        .eq('id', notaImagemId)
        .single();

      if (notaData?.imagem_path) {
        // Remover arquivo do storage
        await supabase.storage
          .from('receipts')
          .remove([notaData.imagem_path]);
      }

      // Remover registro do banco
      await supabase
        .from('notas_imagens')
        .delete()
        .eq('id', notaImagemId);
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Erro na validação:', error);
    return new Response(
      JSON.stringify({
        approved: false,
        reason: 'erro_sistema',
        shouldDelete: false,
        message: '❌ Erro no sistema de validação',
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});