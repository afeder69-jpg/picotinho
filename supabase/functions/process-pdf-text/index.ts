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
    // Primeiro, tentar extração de texto usando uma abordagem mais robusta
    const extractedText = await extractTextRobust(pdfBuffer);
    
    if (extractedText.length > 50) {
      console.log('Texto extraído com sucesso usando método robusto');
      return extractedText;
    }
    
    // Se não conseguiu texto suficiente, retornar vazio para forçar conversão para imagem
    console.log('Não foi possível extrair texto suficiente do PDF');
    return '';
    
  } catch (error) {
    console.error('Erro na extração de texto:', error);
    return '';
  }
}

// Implementação robusta de extração de texto
async function extractTextRobust(pdfBuffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(pdfBuffer);
  const pdfString = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false }).decode(uint8Array);
  
  let extractedText = '';
  
  // Método 1: Buscar por objetos de texto em PDFs
  const textObjectRegex = /BT\s+(.*?)\s+ET/g;
  let match;
  while ((match = textObjectRegex.exec(pdfString)) !== null) {
    const textBlock = match[1];
    if (textBlock) {
      extractedText += ' ' + textBlock;
    }
  }
  
  // Método 2: Buscar por strings entre parênteses (formato PDF padrão)
  const stringRegex = /\(((?:[^()\\]|\\.|\\[0-9]{1,3})*)\)/g;
  while ((match = stringRegex.exec(pdfString)) !== null) {
    let text = match[1];
    if (text && text.length > 1) {
      // Decodificar caracteres especiais do PDF
      text = text
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\[0-9]{3}/g, ' ')
        .replace(/\\./g, ' ')
        .trim();
      
      if (text.length > 2 && /[a-zA-Z0-9]/.test(text)) {
        extractedText += ' ' + text;
      }
    }
  }
  
  // Método 3: Buscar por streams de texto decodificados
  const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
  while ((match = streamRegex.exec(pdfString)) !== null) {
    const streamContent = match[1];
    if (streamContent) {
      // Tentar extrair texto de streams
      const decodedText = decodeStreamText(streamContent);
      if (decodedText.length > 10) {
        extractedText += ' ' + decodedText;
      }
    }
  }
  
  // Método 4: Buscar por padrões específicos de DANFE/Nota Fiscal
  const danfePatterns = [
    /DANFE[\s\S]{0,100}DOCUMENTO AUXILIAR/i,
    /NOTA FISCAL[\s\S]{0,100}ELETR[ÔO]NICA/i,
    /CUPOM FISCAL[\s\S]{0,100}ELETR[ÔO]NICO/i,
    /CNPJ[\s\S]{0,50}\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/i
  ];
  
  for (const pattern of danfePatterns) {
    const matches = pdfString.match(pattern);
    if (matches) {
      extractedText += ' ' + matches[0];
    }
  }
  
  // Limpar e normalizar o texto extraído
  extractedText = extractedText
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\.,\-\(\)\/]/g, ' ')
    .trim();
  
  console.log(`Texto extraído (${extractedText.length} caracteres):`, extractedText.substring(0, 200));
  
  return extractedText;
}

// Função auxiliar para decodificar texto de streams
function decodeStreamText(streamContent: string): string {
  try {
    // Remover caracteres de controle e tentar extrair texto legível
    let decoded = streamContent
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ') // Remove caracteres de controle
      .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ') // Mantém apenas caracteres imprimíveis
      .replace(/\s+/g, ' ')
      .trim();
    
    // Buscar por padrões de texto em português/português
    const textPatterns = [
      /[A-ZÁÊÔÇÃÜ][A-Za-záêôçãü\s]{3,}/g, // Palavras em português
      /\d{2}\/\d{2}\/\d{4}/g, // Datas
      /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, // CNPJ
      /R\$\s*\d+[,\.]\d{2}/g, // Valores monetários
    ];
    
    let result = '';
    for (const pattern of textPatterns) {
      const matches = decoded.match(pattern);
      if (matches) {
        result += ' ' + matches.join(' ');
      }
    }
    
    return result.trim();
  } catch (error) {
    return '';
  }
}