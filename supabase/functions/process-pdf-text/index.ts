import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { notaImagemId, pdfUrl, userId } = await req.json();

    console.log('Iniciando processamento de PDF com extração de texto:', { notaImagemId, pdfUrl, userId });

    // Baixar o PDF
    console.log('Baixando PDF...');
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Falha ao baixar PDF: ${pdfResponse.statusText}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log('PDF baixado, tamanho:', pdfBuffer.byteLength);

    // Tentar extrair texto do PDF
    let extractedText = '';
    try {
      extractedText = await extractTextFromPDF(pdfBuffer);
      console.log('Texto extraído do PDF (primeiros 500 chars):', extractedText.substring(0, 500));
    } catch (error) {
      console.error('Erro na extração de texto:', error);
    }

    // Verificar se conseguimos texto suficiente
    const hasValidText = extractedText.length > 100 && 
                        (extractedText.includes('DANFE') || 
                         extractedText.includes('CUPOM FISCAL') ||
                         extractedText.includes('NOTA FISCAL') ||
                         extractedText.match(/\d+\.\d{3}\.\d{3}\/\d{4}-\d{2}/)); // CNPJ pattern

    if (hasValidText) {
      console.log('PDF contém texto válido, processando com IA...');
      
      // Processar com OpenAI
      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: `Você é um assistente especializado em extrair dados de notas fiscais brasileiras (DANFE, Cupom Fiscal).

IMPORTANTE: Extraia EXATAMENTE as informações como aparecem no texto, sem normalizar nomes de produtos.

Analise o texto da nota fiscal e extraia:

1. DADOS DO ESTABELECIMENTO:
- nome_fantasia (nome do supermercado/loja)
- cnpj (formato: XX.XXX.XXX/XXXX-XX)
- endereco (endereço completo)

2. DADOS DA COMPRA:
- data_compra (formato: YYYY-MM-DD)
- hora_compra (formato: HH:MM:SS)
- valor_total (valor total da compra)
- numero_nota (número da nota fiscal)

3. PRODUTOS/ITENS (array):
Para cada item, extraia:
- descricao (nome exato do produto como aparece)
- quantidade (quantidade comprada)
- unidade (UN, KG, LT, etc.)
- preco_unitario (preço por unidade)
- preco_total (quantidade × preço unitário)

RESPONDA APENAS COM UM JSON VÁLIDO no formato:
{
  "estabelecimento": {
    "nome_fantasia": "string",
    "cnpj": "string",
    "endereco": "string"
  },
  "compra": {
    "data_compra": "YYYY-MM-DD",
    "hora_compra": "HH:MM:SS",
    "valor_total": number,
    "numero_nota": "string"
  },
  "itens": [
    {
      "descricao": "string",
      "quantidade": number,
      "unidade": "string", 
      "preco_unitario": number,
      "preco_total": number
    }
  ]
}`
            },
            {
              role: 'user',
              content: `Extraia os dados desta nota fiscal:\n\n${extractedText}`
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        }),
      });

      if (!aiResponse.ok) {
        throw new Error(`OpenAI API error: ${aiResponse.statusText}`);
      }

      const aiResult = await aiResponse.json();
      const aiContent = aiResult.choices[0].message.content;
      
      console.log('Resposta da IA:', aiContent);

      // Parse do JSON da resposta
      let dadosExtraidos;
      try {
        // Limpar a resposta para extrair apenas o JSON
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          dadosExtraidos = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Formato de resposta inválido da IA');
        }
      } catch (parseError) {
        console.error('Erro ao fazer parse da resposta da IA:', parseError);
        throw new Error('Falha ao processar resposta da IA');
      }

      // Atualizar o registro com os dados extraídos
      const { error: updateError } = await supabase
        .from('notas_imagens')
        .update({
          dados_extraidos: {
            tipo: 'pdf_texto_extraido',
            metodo_processamento: 'extração_texto_direto',
            ...dadosExtraidos
          },
          processada: true
        })
        .eq('id', notaImagemId);

      if (updateError) {
        console.error('Erro ao atualizar registro:', updateError);
        throw new Error('Falha ao salvar dados extraídos');
      }

      console.log('Processamento de PDF com texto concluído com sucesso');

      return new Response(JSON.stringify({
        success: true,
        message: 'PDF processado com extração de texto direto',
        metodo: 'extração_texto',
        itens_extraidos: dadosExtraidos.itens?.length || 0,
        dados: dadosExtraidos
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      console.log('PDF não contém texto suficiente, será necessário OCR por imagem');
      
      // Retornar indicando que precisa de conversão para imagem
      return new Response(JSON.stringify({
        success: false,
        error: 'PDF_REQUER_OCR',
        message: 'PDF não contém texto suficiente, necessário conversão para imagem',
        requer_conversao_imagem: true
      }), {
        status: 200, // Não é erro, é uma condição esperada
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Erro no processamento de PDF:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Função para extrair texto de PDF
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    // Usar API externa para extração de texto (exemplo: ILovePDF Text Extraction)
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
    
    // Tentar ILovePDF para extração de texto
    const textExtractionResponse = await fetch('https://api.ilovepdf.com/v1/start/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (Deno.env.get('ILOVEPDF_API_KEY') || 'public_key')
      },
      body: JSON.stringify({
        task: 'extract'
      })
    });

    if (textExtractionResponse.ok) {
      const task = await textExtractionResponse.json();
      
      // Upload do PDF
      const uploadForm = new FormData();
      uploadForm.append('task', task.task);
      uploadForm.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'document.pdf');
      
      const uploadResponse = await fetch('https://api.ilovepdf.com/v1/upload', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + (Deno.env.get('ILOVEPDF_API_KEY') || 'public_key')
        },
        body: uploadForm
      });

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        
        // Processar extração
        const processResponse = await fetch('https://api.ilovepdf.com/v1/process', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + (Deno.env.get('ILOVEPDF_API_KEY') || 'public_key'),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            task: task.task,
            tool: 'extract',
            files: [uploadResult.server_filename]
          })
        });

        if (processResponse.ok) {
          // Baixar resultado
          const downloadResponse = await fetch(`https://api.ilovepdf.com/v1/download/${task.task}`, {
            headers: {
              'Authorization': 'Bearer ' + (Deno.env.get('ILOVEPDF_API_KEY') || 'public_key')
            }
          });

          if (downloadResponse.ok) {
            const textResult = await downloadResponse.text();
            return textResult;
          }
        }
      }
    }

    // Fallback: usar uma implementação simples de extração
    return await extractTextSimple(pdfBuffer);
    
  } catch (error) {
    console.error('Erro na extração de texto:', error);
    return await extractTextSimple(pdfBuffer);
  }
}

// Implementação simples de extração de texto
async function extractTextSimple(pdfBuffer: ArrayBuffer): Promise<string> {
  // Converter para string e procurar por padrões de texto comuns em PDFs
  const uint8Array = new Uint8Array(pdfBuffer);
  const pdfString = new TextDecoder('latin1').decode(uint8Array);
  
  // Extrair strings entre parênteses que geralmente contêm texto em PDFs
  const textMatches = pdfString.match(/\((.*?)\)/g);
  let extractedText = '';
  
  if (textMatches) {
    extractedText = textMatches
      .map(match => match.slice(1, -1)) // Remove ( )
      .filter(text => text.length > 1 && /[a-zA-Z0-9]/.test(text)) // Filtra texto válido
      .join(' ');
  }
  
  // Se não encontrou texto suficiente, tentar extrair de streams
  if (extractedText.length < 100) {
    const streamMatches = pdfString.match(/stream\s*([\s\S]*?)\s*endstream/g);
    if (streamMatches) {
      for (const stream of streamMatches) {
        const streamContent = stream.replace(/^stream\s*/, '').replace(/\s*endstream$/, '');
        const decodedStream = new TextDecoder('latin1').decode(
          new Uint8Array(streamContent.split('').map(c => c.charCodeAt(0)))
        );
        extractedText += ' ' + decodedStream;
      }
    }
  }
  
  return extractedText.replace(/\s+/g, ' ').trim();
}