import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { notaImagemId, pdfUrl, userId } = await req.json();

    console.log('Processando nota fiscal:', { notaImagemId, pdfUrl, userId });

    // ✅ FLUXO UNIFICADO: Tentar PDF primeiro, depois fallback para imagem
    if (pdfUrl && pdfUrl.toLowerCase().includes('.pdf')) {
      console.log('🔄 Detectado PDF - usando processamento unificado...');
      
      try {
        // Chamar a nova função unificada de processamento de PDF
        const pdfProcessResponse = await fetch(`${supabaseUrl}/functions/v1/process-receipt-pdf`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            notaImagemId,
            pdfUrl,
            userId
          })
        });

        const pdfResult = await pdfProcessResponse.json();
        
        if (pdfResult.success) {
          console.log('✅ PDF processado com sucesso via função unificada');
          return new Response(JSON.stringify(pdfResult), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          console.log('⚠️ PDF falhou, tentando fallback para imagem...');
          // Continuar com processamento por imagem abaixo
        }
      } catch (pdfError) {
        console.error('❌ Erro no processamento unificado de PDF:', pdfError);
        console.log('🔄 Continuando com processamento por imagem...');
      }
    }

    // 🖼️ FALLBACK: Processamento por imagem (para PDFs escaneados ou quando extração de texto falha)
    console.log('🖼️ Iniciando processamento por imagem...');

    // Buscar dados da nota de imagem
    const { data: notaImagem, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', notaImagemId)
      .single();

    if (notaError || !notaImagem) {
      throw new Error('Nota de imagem não encontrada');
    }

    const imageUrl = notaImagem.imagem_url;
    const qrUrl = pdfUrl || imageUrl; // Para compatibilidade

    // 🔍 Primeiro passo: OCR para extrair texto bruto da imagem
    console.log('Executando OCR na imagem...');
      const ocrResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: `FASE 1: VALIDAÇÃO DA NOTA FISCAL - PRIMEIRO PASSO OBRIGATÓRIO

ANTES de extrair os dados, analise esta nota fiscal e determine se ela é válida para o sistema Picotinho:

1️⃣ FILTRO DE ESTABELECIMENTO - Verifique se o nome do emitente contém:
- "Supermercado", "Hipermercado", "Mercado", "Mercearia", "Farmácia", "Hortifruti", "Padaria", "Açougue"
- "Distribuidora" junto com nomes de redes conhecidas (ex: "Sendas Distribuidora")

2️⃣ FILTRO DE PRODUTOS - Analise os itens listados:
- ✅ VÁLIDOS: alimentos, bebidas, higiene, limpeza, frios, congelados, medicamentos, produtos de consumo
- ❌ INVÁLIDOS: pneus, peças de carro, material de construção, produtos industriais

3️⃣ FILTRO DE SERVIÇOS - SEMPRE RECUSAR:
- Serviços de telefonia, internet, oficina mecânica, consultoria, mão de obra, etc.

RESPONDA PRIMEIRO com uma das opções:
- "NOTA_VÁLIDA" - Se passar nos filtros 1 e 2
- "NOTA_INVÁLIDA" - Se for serviço ou produtos claramente inválidos  
- "NOTA_DUVIDOSA" - Se não for serviço mas não parecer supermercado/farmácia

Se for NOTA_VÁLIDA, então prossiga para extrair o texto completo:

⚠️ CRITICAL: Preste atenção especial em extrair COMPLETAMENTE a CHAVE DE ACESSO da nota fiscal de 44 dígitos, que geralmente aparece no final da nota no formato:
- 44 dígitos seguidos: 1234567890123456789012345678901234567890123456
- Ou separados por espaços: 1234 5678 9012 3456 7890 1234 5678 9012 3456 7890 1234

Esta chave é FUNDAMENTAL para o sistema - não pode faltar ou estar incompleta.` 
              },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 3000,
      }),
    });

    const ocrData = await ocrResponse.json();
    
    if (!ocrData.choices?.[0]?.message?.content) {
      throw new Error('Falha no OCR da imagem');
    }

    const textoOCR = ocrData.choices[0].message.content;
    console.log('Resposta completa da IA (validação + OCR):', textoOCR);

    // ✅ VALIDAÇÃO PRÉVIA: Verificar se a resposta da IA contém texto suficiente
    if (!textoOCR || textoOCR.length < 50) {
      console.log('❌ Arquivo rejeitado: resposta da IA muito curta (<50 caracteres)');
      
      // 🗑️ EXCLUIR arquivo inválido automaticamente
      try {
        const { data: notaImagemData } = await supabase
          .from('notas_imagens')
          .select('imagem_path')
          .eq('id', notaImagemId)
          .single();
        
        if (notaImagemData?.imagem_path) {
          console.log('🗑️ Excluindo arquivo inválido:', notaImagemData.imagem_path);
          await supabase.storage
            .from('receipts')
            .remove([notaImagemData.imagem_path]);
        }
        
        // Excluir registro da tabela notas_imagens
        await supabase
          .from('notas_imagens')
          .delete()
          .eq('id', notaImagemId);
          
        console.log('✅ Arquivo inválido excluído automaticamente');
      } catch (deleteError) {
        console.error('⚠️ Erro ao excluir arquivo inválido:', deleteError);
      }
      
      return new Response(JSON.stringify({
        success: false,
        error: "ARQUIVO_INVALIDO",
        message: "❌ Esse arquivo não é uma nota fiscal válida e foi recusado pelo Picotinho.",
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ✅ VALIDAÇÃO PRÉVIA: Verificar se contém elementos básicos de nota fiscal
    const temCaracteristicasBasicas = 
      textoOCR.includes('CNPJ') || 
      textoOCR.includes('CPF') ||
      textoOCR.includes('NFC') || 
      textoOCR.includes('NFe') ||
      textoOCR.includes('Cupom') ||
      textoOCR.includes('Fiscal') ||
      textoOCR.includes('Total') ||
      /\d{14}/.test(textoOCR); // CNPJ pattern

    if (!temCaracteristicasBasicas) {
      console.log('❌ Arquivo rejeitado: não contém características básicas de nota fiscal');
      
      // 🗑️ EXCLUIR arquivo inválido automaticamente
      try {
        const { data: notaImagemData } = await supabase
          .from('notas_imagens')
          .select('imagem_path')
          .eq('id', notaImagemId)
          .single();
        
        if (notaImagemData?.imagem_path) {
          console.log('🗑️ Excluindo arquivo inválido:', notaImagemData.imagem_path);
          await supabase.storage
            .from('receipts')
            .remove([notaImagemData.imagem_path]);
        }
        
        // Excluir registro da tabela notas_imagens
        await supabase
          .from('notas_imagens')
          .delete()
          .eq('id', notaImagemId);
          
        console.log('✅ Arquivo inválido excluído automaticamente');
      } catch (deleteError) {
        console.error('⚠️ Erro ao excluir arquivo inválido:', deleteError);
      }
      
      return new Response(JSON.stringify({
        success: false,
        error: "ARQUIVO_INVALIDO",
        message: "❌ Esse arquivo não é uma nota fiscal válida e foi recusado pelo Picotinho.",
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 🔍 Verificar validação da nota (apenas se não for processamento forçado)
    const forceProcess = false; // Definir explicitamente como false
    if (!forceProcess) {
      if (textoOCR.includes('NOTA_INVÁLIDA')) {
        // 🗑️ EXCLUIR arquivo de serviço automaticamente
        try {
          const { data: notaImagemData } = await supabase
            .from('notas_imagens')
            .select('imagem_path')
            .eq('id', notaImagemId)
            .single();
          
          if (notaImagemData?.imagem_path) {
            console.log('🗑️ Excluindo arquivo de serviço:', notaImagemData.imagem_path);
            await supabase.storage
              .from('receipts')
              .remove([notaImagemData.imagem_path]);
          }
          
          // Excluir registro da tabela notas_imagens
          await supabase
            .from('notas_imagens')
            .delete()
            .eq('id', notaImagemId);
            
          console.log('✅ Arquivo de serviço excluído automaticamente');
        } catch (deleteError) {
          console.error('⚠️ Erro ao excluir arquivo de serviço:', deleteError);
        }
        
        return new Response(JSON.stringify({
          success: false,
          error: 'NOTA_INVALIDA',
          message: 'Esta nota fiscal não é de estabelecimento de consumo (supermercado, farmácia, etc.) ou contém apenas serviços. O Picotinho é focado em compras de consumo.'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (textoOCR.includes('NOTA_DUVIDOSA')) {
        return new Response(JSON.stringify({ 
          success: false,
          error: 'NOTA_DUVIDOSA',
          message: '❓ Esta nota não parece ser de supermercado, farmácia ou comércio de consumo, que é o objetivo do Picotinho. Tem certeza de que deseja inserir esta nota?',
          requiresConfirmation: true,
          notaImagemId: notaImagemId
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log('⚠️ Processamento forçado - pulando validação de tipo de estabelecimento');
    }

    // Extrair apenas o texto OCR (após a validação)
    const textoOCRLimpo = textoOCR.replace(/^(NOTA_VÁLIDA|NOTA_INVÁLIDA|NOTA_DUVIDOSA)[\s\S]*?(?=\n[A-Z])/i, '').trim();
    console.log('Texto extraído por OCR (limpo):', textoOCRLimpo);
    const parseNotaFiscal = (texto: string) => {
      const linhas = texto.split('\n').map(linha => linha.trim()).filter(linha => linha.length > 0);
      
      let supermercado = { nome: '', cnpj: '', endereco: '' };
      let compra = { data: '', hora: '', valorTotal: 0, formaPagamento: '', numeroNotaFiscal: '', chaveAcesso: '' };
      let produtos = [];
      
      // Regex patterns para parsing estruturado
      const cnpjRegex = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
      const dataRegex = /(\d{2}\/\d{2}\/\d{4})/;
      const horaRegex = /(\d{2}:\d{2}:\d{2})/;
      const valorTotalRegex = /TOTAL.*?(\d+[,\.]\d{2})/i;
      const chaveAcessoRegex = /(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/;
      
      // Extrair dados do cabeçalho
      for (let i = 0; i < Math.min(20, linhas.length); i++) {
        const linha = linhas[i];
        
        // CNPJ
        const cnpjMatch = linha.match(cnpjRegex);
        if (cnpjMatch && !supermercado.cnpj) {
          supermercado.cnpj = cnpjMatch[1];
        }
        
        // Nome do estabelecimento (geralmente nas primeiras linhas)
        if (!supermercado.nome && linha.length > 10 && !linha.match(/\d/) && i < 5) {
          supermercado.nome = linha;
        }
        
        // Data
        const dataMatch = linha.match(dataRegex);
        if (dataMatch && !compra.data) {
          const [dia, mes, ano] = dataMatch[1].split('/');
          compra.data = `${ano}-${mes}-${dia}`;
        }
        
        // Hora
        const horaMatch = linha.match(horaRegex);
        if (horaMatch && !compra.hora) {
          compra.hora = horaMatch[1];
        }
      }
      
      // Buscar valor total nas últimas linhas
      for (let i = Math.max(0, linhas.length - 10); i < linhas.length; i++) {
        const linha = linhas[i];
        const valorMatch = linha.match(valorTotalRegex);
        if (valorMatch) {
          compra.valorTotal = parseFloat(valorMatch[1].replace(',', '.'));
          break;
        }
      }
      
      // Buscar chave de acesso
      const textoCompleto = linhas.join(' ');
      const chaveMatch = textoCompleto.match(chaveAcessoRegex);
      if (chaveMatch) {
        compra.chaveAcesso = chaveMatch[1].replace(/\s/g, '');
      }
      
      // 📋 Parsing dos produtos (seção de itens)
      let dentroSecaoProdutos = false;
      const produtoRegex = /^(\d+)\s+(.+?)\s+(\d+[,\.]\d*)\s+(UN|KG|LT|ML|G|PC|PCT|CX|DZ)\s+(\d+[,\.]\d{2})\s+(\d+[,\.]\d{2})$/;
      
      for (const linha of linhas) {
        // Detectar início da seção de produtos
        if (linha.match(/ITEM|PRODUTO|DESCRI[CÇ]ÃO|QTD|UN|VL\s*UNIT|VL\s*TOTAL/i)) {
          dentroSecaoProdutos = true;
          continue;
        }
        
        // Detectar fim da seção de produtos
        if (linha.match(/SUBTOTAL|DESCONTO|TOTAL|FORMA.*PAGAMENTO/i)) {
          dentroSecaoProdutos = false;
          continue;
        }
        
        if (dentroSecaoProdutos) {
          // Tentar match com regex estruturado
          const match = linha.match(produtoRegex);
          if (match) {
            const [, item, nome, quantidade, unidade, precoUnitario, precoTotal] = match;
            
            produtos.push({
              nome: nome.trim(),
              quantidade: parseFloat(quantidade.replace(',', '.')),
              unidadeMedida: unidade,
              precoUnitario: parseFloat(precoUnitario.replace(',', '.')),
              precoTotal: parseFloat(precoTotal.replace(',', '.')),
              desconto: 0
            });
          } else {
            // Fallback: parsing mais flexível
            const partes = linha.split(/\s+/);
            if (partes.length >= 4) {
              const ultimasParts = partes.slice(-3);
              const penultimasParts = partes.slice(-6, -3);
              
              // Verificar se temos números que parecem ser preços
              const possivelTotal = ultimasParts[ultimasParts.length - 1];
              const possivelUnitario = ultimasParts[ultimasParts.length - 2] || penultimasParts[penultimasParts.length - 1];
              
              if (possivelTotal.match(/\d+[,\.]\d{2}/) && possivelUnitario.match(/\d+[,\.]\d{2}/)) {
                const nome = partes.slice(1, -4).join(' ');
                const quantidade = 1; // Default quando não conseguir extrair
                
                produtos.push({
                  nome: nome.trim(),
                  quantidade: quantidade,
                  unidadeMedida: 'UN',
                  precoUnitario: parseFloat(possivelUnitario.replace(',', '.')),
                  precoTotal: parseFloat(possivelTotal.replace(',', '.')),
                  desconto: 0
                });
              }
            }
          }
        }
      }
      
      return { supermercado, compra, produtos };
    };

    const extractedData = parseNotaFiscal(textoOCR);
    
    // 🔍 Validação: soma dos subtotais deve bater com o total
    const somaSubtotais = extractedData.produtos.reduce((acc, produto) => acc + produto.precoTotal, 0);
    const diferencaPercentual = Math.abs(somaSubtotais - extractedData.compra.valorTotal) / extractedData.compra.valorTotal;
    
    console.log(`Validação: Soma subtotais: ${somaSubtotais.toFixed(2)}, Total nota: ${extractedData.compra.valorTotal.toFixed(2)}, Diferença: ${(diferencaPercentual * 100).toFixed(2)}%`);
    
    if (diferencaPercentual > 0.05) { // 5% de tolerância
      throw new Error(`Validação falhou: Soma dos subtotais (${somaSubtotais.toFixed(2)}) não confere com total da nota (${extractedData.compra.valorTotal.toFixed(2)})`);
    }

    console.log('Dados extraídos e validados:', extractedData);

    // 🏪 CADASTRO AUTOMÁTICO DE SUPERMERCADOS
    // Busca ou cria supermercado automaticamente com dados completos
    let supermercado;
    
    // Extrair dados do supermercado das diferentes estruturas possíveis
    const estabelecimentoData = extractedData.supermercado || 
                               extractedData.estabelecimento || 
                               extractedData.emitente || 
                               {};
    
    const cnpjOriginal = estabelecimentoData.cnpj;
    
    if (cnpjOriginal) {
      // Normalizar CNPJ (remover pontuação)
      const cnpjLimpo = cnpjOriginal.replace(/[^\d]/g, '');
      
      console.log(`🔍 Processando supermercado - CNPJ: ${cnpjLimpo} (original: ${cnpjOriginal})`);
      
      if (cnpjLimpo.length >= 14) {
        // Buscar supermercado existente por CNPJ normalizado
        const { data: existingSupermercado } = await supabase
          .from('supermercados')
          .select('*')
          .eq('cnpj', cnpjLimpo)
          .single();

        if (existingSupermercado) {
          console.log(`✅ Supermercado encontrado: ${existingSupermercado.nome}`);
          supermercado = existingSupermercado;
        } else {
          // Criar novo supermercado automaticamente
          console.log(`🆕 Criando novo supermercado: ${estabelecimentoData.nome}`);
          
          const novoSupermercadoData = {
            nome: estabelecimentoData.nome || 'Estabelecimento',
            cnpj: cnpjLimpo, // CNPJ normalizado
            endereco: estabelecimentoData.endereco || null,
            cidade: estabelecimentoData.cidade || null,
            estado: estabelecimentoData.estado || null,
            cep: estabelecimentoData.cep || null,
            ativo: true
          };
          
          const { data: newSupermercado, error: supermercadoError } = await supabase
            .from('supermercados')
            .insert(novoSupermercadoData)
            .select()
            .single();

          if (supermercadoError) {
            console.error('❌ Erro ao criar supermercado:', supermercadoError);
            throw supermercadoError;
          }
          
          supermercado = newSupermercado;
          console.log(`✅ Supermercado criado: ID=${newSupermercado.id}, Nome=${newSupermercado.nome}`);
          
          // Geocodificar endereço do novo supermercado em background
          try {
            const enderecoCompleto = [
              estabelecimentoData.endereco,
              estabelecimentoData.cidade,
              estabelecimentoData.estado,
              estabelecimentoData.cep
            ].filter(Boolean).join(', ');
            
            if (enderecoCompleto.trim()) {
              console.log(`🌍 Iniciando geocodificação para: ${enderecoCompleto}`);
              
              await fetch(`${supabaseUrl}/functions/v1/geocodificar-endereco`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  supermercadoId: newSupermercado.id,
                  endereco: enderecoCompleto
                })
              });
              console.log('✅ Geocodificação iniciada para novo supermercado');
            } else {
              console.log('⚠️ Endereço insuficiente para geocodificação');
            }
          } catch (geoError) {
            console.error('⚠️ Erro ao iniciar geocodificação:', geoError);
            // Não bloquear o processamento por erro de geocodificação
          }
        }
      } else {
        console.log(`❌ CNPJ inválido: ${cnpjLimpo} (length: ${cnpjLimpo.length})`);
      }
    } else {
      console.log('⚠️ Nenhum CNPJ encontrado nos dados extraídos');
    }

    // 🔐 VERIFICAR DUPLICIDADE DE CHAVE DE ACESSO
    if (extractedData.compra.chaveAcesso && extractedData.compra.chaveAcesso.length === 44) {
      console.log(`🔍 Verificando duplicidade da chave: ${extractedData.compra.chaveAcesso}`);
      
      const { data: notaExistente } = await supabase
        .from('compras_app')
        .select('id, created_at')
        .eq('chave_acesso', extractedData.compra.chaveAcesso)
        .single();
      
      if (notaExistente) {
        console.log('❌ Chave de acesso já existe no banco de dados');
        
        // 🗑️ EXCLUIR arquivo duplicado automaticamente
        try {
          // Buscar dados da nota para obter o path do arquivo
          const { data: notaImagemData } = await supabase
            .from('notas_imagens')
            .select('imagem_path')
            .eq('id', notaImagemId)
            .single();
          
          if (notaImagemData?.imagem_path) {
            console.log('🗑️ Excluindo arquivo duplicado:', notaImagemData.imagem_path);
            await supabase.storage
              .from('receipts')
              .remove([notaImagemData.imagem_path]);
          }
          
          // Excluir registro da tabela notas_imagens
          await supabase
            .from('notas_imagens')
            .delete()
            .eq('id', notaImagemId);
            
          console.log('✅ Arquivo duplicado excluído automaticamente');
        } catch (deleteError) {
          console.error('⚠️ Erro ao excluir arquivo duplicado:', deleteError);
        }
        
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'NOTA_DUPLICADA',
            message: 'Essa nota fiscal já foi processada pelo Picotinho e não pode ser lançada novamente.'
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      
      console.log('✅ Chave de acesso válida, prosseguindo com inserção');
    }

    // Cria compra
    const { data: compra, error: compraError } = await supabase
      .from('compras_app')
      .insert({
        user_id: notaImagem.usuario_id,
        supermercado_id: supermercado?.id,
        data_compra: extractedData.compra.data,
        hora_compra: extractedData.compra.hora,
        preco_total: extractedData.compra.valorTotal || 0,
        forma_pagamento: extractedData.compra.formaPagamento,
        numero_nota_fiscal: extractedData.compra.numeroNotaFiscal,
        chave_acesso: extractedData.compra.chaveAcesso,
        qr_code_url: qrUrl,
        status: 'processada'
      })
      .select()
      .single();

    if (compraError) {
      // Se for erro de chave duplicada, retornar mensagem específica
      if (compraError.code === '23505' && compraError.message.includes('unique_chave_acesso')) {
        console.log('❌ Erro de chave de acesso duplicada detectado');
        
        // 🗑️ EXCLUIR arquivo duplicado automaticamente
        try {
          const { data: notaImagemData } = await supabase
            .from('notas_imagens')
            .select('imagem_path')
            .eq('id', notaImagemId)
            .single();
          
          if (notaImagemData?.imagem_path) {
            console.log('🗑️ Excluindo arquivo duplicado:', notaImagemData.imagem_path);
            await supabase.storage
              .from('receipts')
              .remove([notaImagemData.imagem_path]);
          }
          
          // Excluir registro da tabela notas_imagens
          await supabase
            .from('notas_imagens')
            .delete()
            .eq('id', notaImagemId);
            
          console.log('✅ Arquivo duplicado excluído automaticamente');
        } catch (deleteError) {
          console.error('⚠️ Erro ao excluir arquivo duplicado:', deleteError);
        }
        
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'NOTA_DUPLICADA', 
            message: 'Essa nota fiscal já foi processada pelo Picotinho e não pode ser lançada novamente.'
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      throw compraError;
    }

    // 🧠 Função avançada para normalizar nomes de produtos usando tabela dinâmica
    const normalizarNomeProduto = async (nome: string): Promise<string> => {
      let nomeNormalizado = nome
        .toUpperCase()
        .trim();
      
      // Buscar todas as normalizações ativas da tabela
      const { data: normalizacoes, error: normalizacoesError } = await supabase
        .from('normalizacoes_nomes')
        .select('termo_errado, termo_correto')
        .eq('ativo', true);
      
      if (normalizacoesError) {
        console.error('Erro ao buscar normalizações:', normalizacoesError);
        // Fallback para normalizações básicas hardcoded se a tabela falhar
        nomeNormalizado = nomeNormalizado
          .replace(/\bGRAENC\b/gi, 'GRANEL')
          .replace(/\bMAMO\b/gi, 'MAMÃO')
          .replace(/\bMUARELA\b/gi, 'MUÇARELA')
          .replace(/\bTOMY\b/gi, 'TOMMY');
      } else {
        // Aplicar todas as normalizações da tabela
        for (const normalizacao of normalizacoes || []) {
          const regex = new RegExp(`\\b${normalizacao.termo_errado}\\b`, 'gi');
          nomeNormalizado = nomeNormalizado.replace(regex, normalizacao.termo_correto);
        }
      }
      
      // Aplicar normalizações de padrões específicos (mantidas do código original)
      nomeNormalizado = nomeNormalizado
        // NOVA REGRA: Separar "PAO DE FORMA" quando colado a outras palavras
        .replace(/\b(PAO\s+DE\s+FORMA)([A-Z0-9])/gi, '$1 $2')
        
        // Padronizar formatos de pães
        .replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b/gi, 'PAO DE FORMA')
        
        // Padronizar achocolatado
        .replace(/\b(ACHOCOLATADO EM PO NESCAU)\s*(380G|3\.0|30KG|\d+G)?\b/gi, 'ACHOCOLATADO EM PO')
        
        // Remover especificações de peso/tamanho que variam
        .replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL)\b/gi, '')
        .replace(/\b\d+G\b/gi, '') // Remove qualquer especificação de gramagem
        .replace(/\b\d+ML\b/gi, '') // Remove especificação de volume
        .replace(/\b\d+L\b/gi, '') // Remove especificação de litros
        .replace(/\b\d+KG\b/gi, '') // Remove especificação de quilogramas
        
        // Padronizar ordem das palavras para frutas
        .replace(/\b(KG\s+AZEDO)\b/gi, 'AZEDO KG')
        .replace(/\b(AZEDO\s+KG)\b/gi, 'AZEDO KG')
        .replace(/\bGRANEL\s*KG\b/gi, 'KG GRANEL')
        .replace(/\bKG\s*GRANEL\b/gi, 'GRANEL KG')
        
        // Remover marcas específicas para produtos genéricos
        .replace(/\b(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA|NESTLE|COCA|PEPSI|NESCAU|DOMILAC|LAC\s*FREE|ZILAC|GRAN\s*MESTRE|BATAVO|ELEFANTE|GRANFINO)\b/gi, '')
        
        // Limpar espaços múltiplos e caracteres especiais
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
        
      return nomeNormalizado;
    };

    // 🎯 Função para calcular similaridade entre strings (Algoritmo de Jaro-Winkler simplificado)
    const calcularSimilaridade = (str1: string, str2: string): number => {
      if (str1 === str2) return 1.0;
      
      const len1 = str1.length;
      const len2 = str2.length;
      
      if (len1 === 0 || len2 === 0) return 0.0;
      
      // Distância de Levenshtein simplificada
      const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
      
      for (let i = 0; i <= len1; i++) matrix[i][0] = i;
      for (let j = 0; j <= len2; j++) matrix[0][j] = j;
      
      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,     // deletar
            matrix[i][j - 1] + 1,     // inserir
            matrix[i - 1][j - 1] + cost // substituir
          );
        }
      }
      
      const maxLen = Math.max(len1, len2);
      return (maxLen - matrix[len1][len2]) / maxLen;
    };

    // Processa produtos e atualiza estoque automaticamente
    if (extractedData.produtos && Array.isArray(extractedData.produtos)) {
      console.log('📦 Atualizando estoque automaticamente...');
      
      for (const produtoData of extractedData.produtos) {
        try {
          const nomeNormalizado = await normalizarNomeProduto(produtoData.nome);
          console.log(`🏷️ Produto original: "${produtoData.nome}" -> Normalizado: "${nomeNormalizado}"`);
          
          // Verificar se já existe um produto similar no estoque
          const { data: estoqueLista, error: estoqueListaError } = await supabase
            .from('estoque_app')
            .select('*')
            .eq('user_id', notaImagem.usuario_id);

          if (estoqueListaError) {
            console.error('Erro ao buscar lista de estoque:', estoqueListaError);
            continue;
          }

          // 🎯 Procurar produto similar usando algoritmo inteligente
          let produtoSimilar = null;
          if (estoqueLista && estoqueLista.length > 0) {
            // Primeiro: tentar match exato com o nome normalizado
            for (const prod of estoqueLista) {
              const produtoNomeNormalizado = await normalizarNomeProduto(prod.produto_nome);
              if (produtoNomeNormalizado === nomeNormalizado) {
                produtoSimilar = prod;
                break;
              }
            }
            
            // Segundo: se não achou exato, buscar por similaridade alta (>85%)
            if (!produtoSimilar) {
              let melhorSimilaridade = 0;
              for (const item of estoqueLista) {
                const nomeExistente = await normalizarNomeProduto(item.produto_nome);
                const similaridade = calcularSimilaridade(nomeNormalizado, nomeExistente);
                
                if (similaridade >= 0.85 && similaridade > melhorSimilaridade) {
                  melhorSimilaridade = similaridade;
                  produtoSimilar = item;
                }
              }
            }
          }

          if (produtoSimilar) {
            // 📈 Atualizar produto existente
            const novaQuantidade = produtoSimilar.quantidade + (produtoData.quantidade || 1);
            
            const { error: updateError } = await supabase
              .from('estoque_app')
              .update({
                quantidade: novaQuantidade,
                preco_unitario_ultimo: produtoData.precoUnitario || produtoSimilar.preco_unitario_ultimo,
                updated_at: new Date().toISOString()
              })
              .eq('id', produtoSimilar.id);

            if (updateError) {
              console.error('Erro ao atualizar estoque:', updateError);
            } else {
              console.log(`✅ Estoque atualizado: ${produtoSimilar.produto_nome} (${produtoSimilar.quantidade} + ${produtoData.quantidade || 1} = ${novaQuantidade})`);
            }
          } else {
            // 🆕 Criar novo item no estoque
            const { error: insertError } = await supabase
              .from('estoque_app')
              .insert({
                user_id: notaImagem.usuario_id,
                produto_nome: nomeNormalizado, // Usar nome normalizado
                categoria: produtoData.categoria || 'outros',
                quantidade: produtoData.quantidade || 1,
                unidade_medida: produtoData.unidadeMedida || 'UN',
                preco_unitario_ultimo: produtoData.precoUnitario || 0
              });

            if (insertError) {
              console.error('Erro ao inserir no estoque:', insertError);
            } else {
              console.log(`🆕 Novo item no estoque: ${nomeNormalizado} (${produtoData.quantidade || 1} ${produtoData.unidadeMedida || 'UN'})`);
            }
          }

          // Busca ou cria categoria
          let categoria;
          if (produtoData.categoria) {
            const { data: existingCategoria } = await supabase
              .from('categorias')
              .select('*')
              .eq('nome', produtoData.categoria)
              .eq('user_id', notaImagem.usuario_id)
              .single();

            if (existingCategoria) {
              categoria = existingCategoria;
            } else {
              const { data: newCategoria } = await supabase
                .from('categorias')
                .insert({
                  nome: produtoData.categoria,
                  user_id: notaImagem.usuario_id,
                  cor: '#6366f1',
                  icone: 'Package'
                })
                .select()
                .single();
              categoria = newCategoria;
            }
          }

          // Busca ou cria produto
          let produto;
          const { data: existingProduto } = await supabase
            .from('produtos_app')
            .select('*')
            .eq('nome', nomeNormalizado) // Usar nome normalizado para busca
            .single();

          if (existingProduto) {
            produto = existingProduto;
          } else {
            const { data: newProduto } = await supabase
              .from('produtos_app')
              .insert({
                nome: nomeNormalizado, // Usar nome normalizado
                marca: produtoData.marca,
                categoria_id: categoria?.id,
                unidade_medida: produtoData.unidadeMedida || 'unidade'
              })
              .select()
              .single();
            produto = newProduto;
          }

          // Cria item da compra
          await supabase
            .from('itens_compra_app')
            .insert({
              compra_id: compra.id,
              produto_id: produto.id,
              quantidade: produtoData.quantidade || 1,
              preco_unitario: produtoData.precoUnitario || 0,
              preco_total: produtoData.precoTotal || 0,
              desconto_item: produtoData.desconto || 0
            });

        } catch (produtoError) {
          console.error('Erro ao processar produto:', produtoData.nome, produtoError);
        }
      }
    }

    // Salva na tabela notas_fiscais
    const { data: notaFiscal } = await supabase
      .from('notas_fiscais')
      .insert({
        user_id: notaImagem.usuario_id,
        mercado: extractedData.estabelecimento?.nome || null,
        bairro: extractedData.estabelecimento?.endereco || null,
        cnpj: extractedData.estabelecimento?.cnpj || null,
        data_compra: extractedData.compra?.dataCompra || new Date().toISOString(),
        valor_total: extractedData.compra?.precoTotal || 0,
        qtd_itens: extractedData.produtos?.length || 0
      })
      .select()
      .single();

    // Salva itens na tabela itens_nota
    if (notaFiscal && extractedData.produtos?.length > 0) {
      const itensParaSalvar = extractedData.produtos.map(produto => ({
        nota_id: notaFiscal.id,
        descricao: produto.nome || produto.descricao || 'Produto não identificado',
        codigo: produto.codigo || null,
        quantidade: produto.quantidade || 1,
        unidade: produto.unidadeMedida || 'UN',
        valor_unitario: produto.precoUnitario || 0,
        valor_total: produto.precoTotal || 0,
        categoria: produto.categoria || 'outros'
      }));

      await supabase
        .from('itens_nota')
        .insert(itensParaSalvar);

      // Atualizar preços atuais de forma inteligente para cada produto
      for (const produto of extractedData.produtos) {
        if (produto.nome && produto.precoUnitario && supermercado?.cnpj) {
          try {
            // Chamar função especializada que considera data/hora e área de atuação
            await fetch(`${supabaseUrl}/functions/v1/update-precos-atuais`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                compraId: compra.id,
                produtoNome: produto.nome,
                precoUnitario: produto.precoUnitario,
                estabelecimentoCnpj: supermercado.cnpj,
                estabelecimentoNome: supermercado.nome,
                dataCompra: extractedData.compra.data,
                horaCompra: extractedData.compra.hora,
                userId: notaImagem.usuario_id
              })
            });
            
            console.log(`✅ Preço atual processado para: ${produto.nome}`);
          } catch (precoError) {
            console.error('Erro ao processar preço atual:', precoError);
          }
        }
      }
    }

    // Atualizar preços atuais para todos os produtos processados
    console.log('🔄 Atualizando preços atuais...');
    let precosAtualizados = 0;
    
    if (extractedData.produtos && Array.isArray(extractedData.produtos)) {
      for (const produto of extractedData.produtos) {
        try {
          const { error: updatePrecoError } = await supabase.functions.invoke('update-precos-atuais', {
            body: {
              compraId: compra.id,
              produtoNome: produto.nome_normalizado || produto.nome,
              precoUnitario: produto.preco_unitario || 0,
              estabelecimentoCnpj: extractedData.cnpj_limpo,
              estabelecimentoNome: extractedData.supermercado || extractedData.mercado || 'Estabelecimento',
              dataCompra: extractedData.data_compra,
              horaCompra: extractedData.hora_compra,
              userId: notaImagem.usuario_id
            }
          });
          
          if (updatePrecoError) {
            console.error(`❌ Erro ao atualizar preço atual do produto ${produto.nome}:`, updatePrecoError);
          } else {
            precosAtualizados++;
            console.log(`✅ Preço atual atualizado: ${produto.nome} - R$ ${produto.preco_unitario}`);
          }
        } catch (priceError) {
          console.error(`❌ Erro no preço do produto ${produto.nome}:`, priceError);
        }
      }
    }
    
    console.log(`💰 ${precosAtualizados} preços atuais atualizados`);

    // Atualiza compra_id na nota de imagem e marca como processada
    await supabase
      .from('notas_imagens')
      .update({
        compra_id: compra.id,
        processada: true,
        dados_extraidos: extractedData
      })
      .eq('id', notaImagemId);

    console.log('Processamento concluído com sucesso');

    return new Response(
      JSON.stringify({ 
        success: true, 
        compraId: compra.id,
        notaFiscalId: notaFiscal?.id,
        produtosProcessados: extractedData.produtos?.length || 0,
        precosAtualizados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro no processamento:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro no processamento da nota fiscal',
        details: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});