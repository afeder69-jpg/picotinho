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
  fromInfoSimples?: boolean;
}

interface ValidationResult {
  approved: boolean;
  reason: string;
  shouldDelete: boolean;
  message: string;
}

// Função para extrair texto de PDF (mesma implementação da IA-2)
async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    // Import pdfjs-dist usando uma abordagem compatível com Deno
    const { getDocument } = await import("npm:pdfjs-dist@4.0.379/build/pdf.mjs");
    
    const pdf = await getDocument({ data: pdfBuffer }).promise;
    let extractedText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      extractedText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
    }
    
    return extractedText.trim();
  } catch (error) {
    console.error("❌ Erro ao extrair texto do PDF:", error);
    // Fallback: tentar extrair texto simples usando regex
    const pdfString = new TextDecoder("latin1").decode(pdfBuffer);
    const regex = /\(([^)]+)\)/g;
    let extractedText = "";
    let match;
    while ((match = regex.exec(pdfString)) !== null) {
      extractedText += match[1] + " ";
    }
    return extractedText.trim();
  }
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

    const { notaImagemId, imageUrl, pdfUrl, userId, fromInfoSimples }: ValidationRequest = await req.json();

    console.log('=== IA-1 VALIDAÇÃO INICIADA ===', {
      notaImagemId,
      userId,
      hasImage: !!imageUrl,
      hasPdf: !!pdfUrl,
      fromInfoSimples: fromInfoSimples || false
    });

    const validationPrompt = `Analise este documento e responda APENAS com um JSON no formato especificado.

CRITÉRIOS DE VALIDAÇÃO:
1. CHAVE DE ACESSO: Procure por sequência de 44 dígitos (pode ter espaços, pontos, quebras). Normalize: O→0, I/l→1, B→8.
2. ESTABELECIMENTO: Identifique o tipo/setor do emissor.
3. SINAIS DE COMPRA: Verifique se há itens com descrição+quantidade+valor, valor total, ou forma de pagamento.

SETORES ACEITOS NO PICOTINHO:
- Supermercados, mercados, mercearias, hipermercados
- Padarias, açougues, lanchonetes
- Farmácias e drogarias (produtos de higiene/limpeza/medicamentos)
- Pet shops, agropecuárias (produtos para pets/animais)
- Atacadões, lojas de conveniência
- Cosméticos, perfumarias, lojas de beleza e higiene pessoal

SETORES QUE DEVEM SER REJEITADOS:
- Indústrias, fábricas, biorrefinarias, refinarias
- Postos de gasolina (exceto conveniência)
- Restaurantes, bares, serviços de alimentação
- Lojas de roupas, eletrônicos, móveis, decoração
- Serviços gerais (oficinas, salões, consultórios)
- E-commerce não alimentar
- Distribuidoras industriais, atacados não alimentares

REGRAS DE APROVAÇÃO:
- APROVAR se: Há chave de 44 dígitos E o estabelecimento é de um dos setores aceitos
- REPROVAR se: Não tem chave de 44 dígitos OU é de setor não relacionado a produtos de consumo diário

No campo "setor_inferido", classifique o tipo de estabelecimento (ex: "supermercado", "farmacia", "industria", "posto_gasolina").

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
    
    // Processar notas já validadas pelo InfoSimples
    if (fromInfoSimples) {
      console.log('📱 Nota do InfoSimples - buscando dados já extraídos');
      
      // Buscar dados_extraidos salvos pelo process-nfce-infosimples
      const { data: notaData, error: notaError } = await supabase
        .from('notas_imagens')
        .select('dados_extraidos')
        .eq('id', notaImagemId)
        .single();
      
      if (notaError || !notaData?.dados_extraidos) {
        throw new Error('Dados extraídos não encontrados para nota InfoSimples');
      }
      
      // ✅ VALIDAÇÃO RIGOROSA: Verificar completude dos dados
      const dadosExtraidos = notaData.dados_extraidos;
      const chaveAcesso = dadosExtraidos.chave_acesso || 
                          dadosExtraidos.compra?.chave_acesso;
      
      // Validar chave de acesso (44 dígitos)
      const chaveValida = chaveAcesso && 
                          chaveAcesso.replace(/\D/g, '').length === 44;
      
      // Validar produtos (deve ter pelo menos 1 item)
      const temProdutos = (dadosExtraidos.itens && dadosExtraidos.itens.length > 0) ||
                          (dadosExtraidos.produtos && dadosExtraidos.produtos.length > 0);
      
      // Validar estabelecimento
      const temEstabelecimento = dadosExtraidos.estabelecimento?.nome || 
                                  dadosExtraidos.emitente?.nome;
      
      // Validar valor total (buscar em múltiplos lugares)
      const valorTotal = dadosExtraidos.compra?.valor_total || 
                         dadosExtraidos.valor_total || 
                         0;
      const temValorTotal = valorTotal > 0;
      
      console.log('🔍 Validação InfoSimples:', {
        chaveValida,
        temProdutos,
        temEstabelecimento,
        temValorTotal,
        numProdutos: dadosExtraidos.itens?.length || dadosExtraidos.produtos?.length
      });
      
      if (!chaveValida || !temProdutos || !temEstabelecimento || !temValorTotal) {
        console.error('❌ Dados InfoSimples incompletos!', {
          chave: chaveAcesso,
          produtos: dadosExtraidos.produtos?.length,
          estabelecimento: temEstabelecimento,
          valor: dadosExtraidos.valor_total
        });
        
        analysisText = JSON.stringify({
          approved: false,
          reason: 'dados_incompletos',
          chave_encontrada: chaveAcesso || null,
          setor_inferido: 'desconhecido',
          tem_sinais_compra: temProdutos,
          eh_nfse: false
        });
      } else {
        // Simular resposta positiva (InfoSimples já validou a nota)
        analysisText = JSON.stringify({
          approved: true,
          reason: 'infosimples_validado',
          chave_encontrada: chaveAcesso,
          setor_inferido: dadosExtraidos.setor_inferido || 'supermercado',
          tem_sinais_compra: true,
          eh_nfse: false
        });
        
        console.log('✅ Dados InfoSimples validados:', {
          chave: chaveAcesso?.slice(-6),
          produtos: dadosExtraidos.produtos?.length
        });
      }
      
    } else if (pdfUrl) {
      // Para PDF, usar extração de texto igual à IA-2
      console.log('Processando PDF como na IA-2:', pdfUrl);
      
      try {
        // Baixar PDF e extrair texto
        const resp = await fetch(pdfUrl);
        if (!resp.ok) throw new Error(`Falha ao baixar PDF: ${resp.status}`);
        const buffer = await resp.arrayBuffer();
        
        const extractedText = await extractTextFromPDF(new Uint8Array(buffer));
        console.log('Texto extraído do PDF:', extractedText.substring(0, 500) + '...');
        
        if (!extractedText || extractedText.length < 50) {
          throw new Error('PDF não contém texto suficiente');
        }
        
        // Usar modelo de texto para analisar o conteúdo extraído
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
                content: validationPrompt
              },
              {
                role: 'user',
                content: `Analise este texto extraído de PDF e determine se é uma nota fiscal de produtos válida:\n\n${extractedText}`
              }
            ],
            max_completion_tokens: 300
          }),
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          console.error('Erro OpenAI:', errorText);
          throw new Error(`OpenAI Error: ${openaiResponse.status} ${openaiResponse.statusText}`);
        }

        const openaiResult = await openaiResponse.json();
        analysisText = openaiResult.choices[0]?.message?.content || '{}';
        
        console.log('OpenAI resposta para PDF:', analysisText);
        
      } catch (pdfError) {
        console.error('Erro ao analisar PDF:', pdfError);
        // Para PDFs com erro, assumir como inválido
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
      // Para imagem, análise via visão (igual à IA-2)
      console.log('Analisando imagem via OpenAI Vision:', imageUrl);
      
      try {
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
            max_completion_tokens: 300
          }),
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          console.error('Erro OpenAI:', errorText);
          throw new Error(`OpenAI Error: ${openaiResponse.status} ${openaiResponse.statusText}`);
        }

        const openaiResult = await openaiResponse.json();
        analysisText = openaiResult.choices[0]?.message?.content || '{}';
        
        console.log('OpenAI resposta para imagem:', analysisText);
        
      } catch (imageError) {
        console.error('Erro ao analisar imagem:', imageError);
        // Para imagens com erro, assumir como inválido
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

      if (normalizedKey.length >= 43) { // Aceitar chaves com 43 ou 44 dígitos
        console.log('🔍 Verificando duplicidade (TODOS OS USUÁRIOS) para chave:', normalizedKey);

        // Assegurar que a própria nota já armazene a chave para futuras verificações
        try {
          const { data: notaAtual } = await supabase
            .from('notas_imagens')
            .select('dados_extraidos')
            .eq('id', notaImagemId)
            .single();

          if (notaAtual) {
            const dadosAtualizados = {
              ...(notaAtual.dados_extraidos || {}),
              chave_acesso: normalizedKey,
            };
            await supabase
              .from('notas_imagens')
              .update({ dados_extraidos: dadosAtualizados })
              .eq('id', notaImagemId);
          }
        } catch (e) {
          console.warn('Não foi possível salvar chave na nota atual antes da checagem:', e);
        }

        // BUSCAR CHAVES SIMILARES: tanto exata quanto com 1 dígito a mais/menos
        const chaveVariations = [
          normalizedKey,
          normalizedKey.padEnd(44, '0'), // Adicionar zero se tiver 43 dígitos
          normalizedKey.length === 44 ? normalizedKey.slice(0, 43) : null // Remover último se tiver 44
        ].filter(Boolean) as string[];

        console.log('Variações de chave para busca:', chaveVariations);

        // 🔥 Verificar em TODOS OS USUÁRIOS do Picotinho
        // Procurar em notas_imagens de QUALQUER USUÁRIO (não apenas do atual)
        const orConditions = chaveVariations.flatMap((chave) => [
          `dados_extraidos->chave_acesso.eq."${chave}"`,
          `dados_extraidos->>chave_acesso.eq."${chave}"`,
          `dados_extraidos->compra->>chave_acesso.eq."${chave}"`,
        ]).join(',');

        const { data: existingInImages, error: imgErr } = await supabase
          .from('notas_imagens')
          .select('id, created_at, usuario_id')
          .or(orConditions);

        if (imgErr) console.error('Erro buscando duplicidade em notas_imagens:', imgErr);

        // ✅ Filtrar MANUALMENTE a nota atual após busca (evita falso positivo)
        const existingInImagesFiltered = existingInImages?.filter(
          nota => nota.id !== notaImagemId
        ) || [];

        isDuplicate = existingInImagesFiltered.length > 0;

        if (isDuplicate) {
          console.log('⚠️ DUPLICATA DETECTADA! Chave já existe no Picotinho:', normalizedKey.slice(-6));
          console.log('📋 Encontrada em notas_imagens de usuário(s):', existingInImagesFiltered.map(n => n.usuario_id));
        } else {
          console.log('✅ Chave única no Picotinho - não há duplicatas:', normalizedKey.slice(-6));
        }
      }
    }

    // ========== VALIDAÇÃO DE SETOR ==========
    const SETORES_VALIDOS = [
      'supermercado', 'mercado', 'padaria', 'acougue', 
      'mercearia', 'hipermercado', 'minimercado', 'atacadao',
      'varejo_alimentar', 'loja_conveniencia',
      'farmacia', 'drogaria',
      'pet_shop', 'agropecuaria', 'petshop',
      'cosmeticos', 'perfumaria', 'beleza', 'loja_cosmeticos', 'higiene_pessoal', 'loja_beleza'
    ];

    const setorNormalizado = (analysis.setor_inferido || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]/g, '_') // normaliza
      .replace(/_+/g, '_'); // remove underscores duplicados

    const setorValido = SETORES_VALIDOS.some(setor => 
      setorNormalizado.includes(setor.replace(/_/g, ''))
    );

    console.log('🏪 Validação de setor:', {
      setorOriginal: analysis.setor_inferido,
      setorNormalizado,
      setorValido,
      approved: analysis.approved
    });

    // Determinar resultado final
    let result: ValidationResult;

    if (!setorValido && analysis.approved && analysis.setor_inferido) {
      console.log('❌ SETOR INVÁLIDO DETECTADO:', analysis.setor_inferido);
      result = {
        approved: false,
        reason: 'setor_invalido',
        shouldDelete: true,
        message: `Este tipo de estabelecimento (${analysis.setor_inferido}) ainda não é aceito pelo Picotinho.\n\nHoje o Picotinho aceita notas de: supermercados, mercados, padarias, açougues, farmácias, pet shops, perfumarias e lojas de cosméticos/beleza.\n\nEstamos sempre ampliando os tipos aceitos! 😊`
      };
    } else if (isDuplicate) {
      result = {
        approved: false,
        reason: 'duplicada',
        shouldDelete: false,
        message: '📋 Esta nota fiscal já foi lançada no PICOTINHO por você ou por outro usuário! Cada nota só pode ser processada uma vez no sistema.'
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

    // CORREÇÃO CRÍTICA: Salvar chave de acesso encontrada no banco de dados
    if (result.approved && analysis.chave_encontrada) {
      console.log('💾 Salvando chave de acesso encontrada no banco de dados');
      
      // Buscar dados extraídos atuais
      const { data: notaAtual } = await supabase
        .from('notas_imagens')
        .select('dados_extraidos')
        .eq('id', notaImagemId)
        .single();
      
      if (notaAtual?.dados_extraidos) {
        // 🏪 Normalizar nome do estabelecimento nos dados extraídos
        const dados = notaAtual.dados_extraidos;
        let estabelecimentoNormalizado = null;
        
        // Buscar nome original do estabelecimento
        const nomeOriginal = dados?.supermercado?.nome || dados?.estabelecimento?.nome || dados?.emitente?.nome;
        
        if (nomeOriginal) {
          const { data: nomeNormalizado } = await supabase.rpc('normalizar_nome_estabelecimento', {
            nome_input: nomeOriginal
          });
          estabelecimentoNormalizado = nomeNormalizado || nomeOriginal.toUpperCase();
        }
        
        // Atualizar dados extraídos com a chave de acesso e nome normalizado
        const dadosAtualizados = {
          ...notaAtual.dados_extraidos,
          chave_acesso: analysis.chave_encontrada
        };
        
        // Aplicar normalização do estabelecimento em todos os locais possíveis
        if (estabelecimentoNormalizado) {
          if (dadosAtualizados.supermercado) {
            dadosAtualizados.supermercado.nome = estabelecimentoNormalizado;
          }
          if (dadosAtualizados.estabelecimento) {
            dadosAtualizados.estabelecimento.nome = estabelecimentoNormalizado;
          }
          if (dadosAtualizados.emitente) {
            dadosAtualizados.emitente.nome = estabelecimentoNormalizado;
          }
        }
        
        await supabase
          .from('notas_imagens')
          .update({ dados_extraidos: dadosAtualizados })
          .eq('id', notaImagemId);
        
        console.log('✅ Chave de acesso salva com sucesso:', analysis.chave_encontrada.slice(-6));
      }
    }

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
})