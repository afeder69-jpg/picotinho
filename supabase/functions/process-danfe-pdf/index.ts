import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractTextFromPDF(pdfBuffer: Uint8Array): Promise<string> {
  try {
    // Import pdfjs-dist usando uma abordagem compatível com Deno
    const { getDocument } = await import("https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs");
    
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

// Função para extrair bairro do endereço
function extrairBairro(endereco: string): string | null {
  if (!endereco) return null;
  
  // Padrões comuns de endereços brasileiros
  // Ex: "AVENIDA CESARIO DE MELO, 5400, CAMPO GRANDE, RIO DE JANEIRO, RJ"
  // Ex: "RUA DAS FLORES, 123, COPACABANA, RIO DE JANEIRO, RJ"
  const partes = endereco.split(',').map(p => p.trim());
  
  if (partes.length >= 3) {
    // Geralmente o bairro é a 3ª parte (após rua e número)
    return partes[2] || null;
  }
  
  return null;
}

function normalizarTextoDanfe(texto: string): string {
  if (!texto) return texto;

  return texto
    // Correções de acentuação
    .replace(/C digo/g, "Código")
    .replace(/Cart o/g, "Cartão")
    .replace(/D bito/g, "Débito")
    .replace(/Valor Unit rio/g, "Valor Unitário")
    .replace(/Emiss o/g, "Emissão")
    .replace(/Informa es/g, "Informações")
    .replace(/Autoriza o/g, "Autorização")
    .replace(/n o identi ficado/g, "não identificado")

    // Correções de espaços indevidos
    .replace(/identi ficado/g, "identificado")
    .replace(/Consu midor/g, "Consumidor")

    // Normalização de unidades
    .replace(/Unidade: Unidade/g, "Unidade")
    .replace(/Unidade: Kg/g, "Kg")

    // Expansão de abreviações mais comuns em DANFE
    .replace(/\bQtde\./g, "Quantidade")
    .replace(/\bVl\. Unit\./g, "Valor Unitário")
    .replace(/\bVl\. Total/g, "Valor Total")
    .replace(/\bUN\b/g, "Unidade")
    .replace(/\bkg\b/gi, "Kg")
    .replace(/\bg\b/gi, "Gramas")
    .replace(/\bLT\b/gi, "Litros")

    // Limpeza de espaços duplicados
    .replace(/\s{2,}/g, " ")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pdfUrl, notaImagemId, userId } = await req.json();

    if (!pdfUrl || !notaImagemId || !userId) {
      return new Response(JSON.stringify({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "Parâmetros obrigatórios ausentes"
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log("📥 Verificando arquivo:", pdfUrl);
    
    // VERIFICAR SE É REALMENTE UM PDF
    if (pdfUrl.toLowerCase().includes('.jpg') || pdfUrl.toLowerCase().includes('.jpeg')) {
      console.log("❌ ERRO: Tentativa de processar JPG como PDF");
      return new Response(JSON.stringify({
        success: false,
        error: "INVALID_FILE_TYPE",
        message: "Arquivo JPG não pode ser processado como PDF. Use a função de OCR para imagens."
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log("📥 Baixando PDF:", pdfUrl);
    const resp = await fetch(pdfUrl);
    if (!resp.ok) throw new Error(`Falha ao baixar PDF: ${resp.status}`);
    const buffer = await resp.arrayBuffer();

    // 📄 Extrair texto do PDF usando pdfjs-dist
    console.log("📄 Extraindo texto do PDF...");
    const extractedText = await extractTextFromPDF(new Uint8Array(buffer));
    const textoLimpo = normalizarTextoDanfe(extractedText);

    console.log("📝 TEXTO_BRUTO completo da DANFE:");
    console.log(extractedText); // TEXTO COMPLETO, sem cortar
    console.log("=".repeat(80));
    console.log("📝 Texto normalizado DANFE:");
    console.log(textoLimpo); // TEXTO NORMALIZADO COMPLETO, sem cortar
    console.log("=".repeat(80));

    if (!textoLimpo || textoLimpo.length < 50) {
      return new Response(JSON.stringify({
        success: false,
        error: "INSUFFICIENT_TEXT",
        message: "PDF não contém texto suficiente — provavelmente é escaneado",
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 🤖 Processar com IA para estruturar dados
    console.log("🤖 Enviando para IA estruturar dados...");
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const aiPrompt = `Você recebeu o texto extraído de uma DANFE NFC-e.

IMPORTANTE: O JSON deve incluir ABSOLUTAMENTE TODOS OS ITENS extraídos, sem omitir nenhum produto.

1. Estruture em JSON os dados da compra:
   • Estabelecimento (nome, cnpj, endereco)
   • Compra (valor_total, forma_pagamento, numero, serie, data_emissao, chave_acesso)
   • Itens (descrição corrigida, codigo, quantidade, unidade, valor_unitario, valor_total, categoria)

🔑 EXTRAÇÃO DE CHAVE DE ACESSO - CRÍTICO:
   - PROCURE e extraia a CHAVE DE ACESSO de 44 dígitos numéricos
   - Esta chave é FUNDAMENTAL para evitar notas duplicadas
   - Formato: 44 números seguidos (ex: 33191234567890001234567890001234567890123456)
   - Salve no campo "chave_acesso" dentro do objeto "compra"
   - Se não encontrar, deixe null

2. Regras OBRIGATÓRIAS:
   - Para VALOR TOTAL: identifique apenas o valor oficial total da compra, ignorando números soltos no início do texto.
   - Para DESCRIÇÕES: limpe e padronize os nomes dos produtos:
     • JAMAIS altere marcas ou nomes originais (ex: se estiver "Nescau" não pode virar "Nesquik", se estiver "Plusvita" não pode virar "Pullman")
     • NUNCA inclua quantidade comprada na descrição (a quantidade vai no campo separado "quantidade")
     • Remova espaços duplicados entre palavras
     • Organize na ordem: Nome + Marca/Variedade + Peso/Volume + Extra (Granel, Corte, etc.)
     • Exemplos: "Mamão Formosa Granel" ou "Manga Palmer Granel" (sem incluir o peso comprado 1.135kg na descrição)
     • SEMPRE preserve peso/volume/medidas DA EMBALAGEM (350g, 535g, 1L, 2kg, 170g, etc.)
     • Peso/volume da embalagem é parte da identidade única do produto e NÃO pode ser removido
     • Corrija apenas ortografia, acentuação e capitalização de erros de extração (ex: "Cart o" → "Cartão")
     • NÃO invente ou troque nomes/marcas, apenas limpe e organize o que está no texto original
   - NÃO altere números, quantidades, CNPJs ou chaves de acesso.
   - Se houver itens iguais repetidos, unifique em um só, somando a quantidade e ajustando o valor_total.
    - Categorize cada item usando APENAS estas categorias fixas:
      [hortifruti, bebidas, padaria, mercearia, açougue, laticínios/frios, limpeza, higiene/farmácia, congelados, pet, outros]
    - Use "outros" somente em último caso, quando o produto realmente não pertence a nenhuma dessas categorias.
    - Produtos comuns de mercado devem sempre ser classificados corretamente:
      • Tempero Verde, Cheiro Verde, Salsa, Cebolinha → hortifruti
      • Milho Verde (lata/conserva), Aveia, Sal, Azeite, Ovos, Massa/Macarrão → mercearia
      • Esponja de Aço, Bombril → limpeza
      • Achocolatado → bebidas ou mercearia
      • Extrato de tomate → mercearia  
      • Frutas, verduras, legumes → hortifruti
    - TODOS os itens DEVEM ter uma categoria obrigatoriamente.
   - O JSON deve estar sempre COMPLETO e bem fechado, válido do início ao fim.
   - NUNCA truncar ou cortar no meio - incluir TODOS os itens da nota.

CRÍTICO: Se o texto não contém dados suficientes ou é ilegível, retorne exatamente:
{"error": "EXTRACTION_FAILED", "message": "PDF ilegível ou dados insuficientes"}

3. Estrutura OBRIGATÓRIA do retorno (apenas se dados válidos):
\`\`\`json
{
  "estabelecimento": {
    "nome": "...",
    "cnpj": "...", 
    "endereco": "..."
  },
  "compra": {
    "valor_total": 0.00,
    "forma_pagamento": "...",
    "numero": "...",
    "serie": "...",
    "data_emissao": "...",
    "chave_acesso": "44444444444444444444444444444444444444444444"
  },
  "itens": [
    {
      "descricao": "...",
      "codigo": "...",
      "quantidade": 1,
      "unidade": "...",
      "valor_unitario": 0.00,
      "valor_total": 0.00,
      "categoria": "..."
    }
  ]
}
\`\`\`

Texto da DANFE:
${textoLimpo}

Retorne APENAS o JSON estruturado completo, sem explicações adicionais. GARANTA que o JSON seja válido e contenha TODOS os itens da nota.`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um especialista em processamento de notas fiscais brasileiras. Retorne sempre um JSON válido e bem estruturado.' },
          { role: 'user', content: aiPrompt }
        ],
        max_tokens: 4000, // Aumentado para garantir que o JSON completo seja retornado
        temperature: 0.1
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`Erro na API OpenAI: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const respostaIA = aiData.choices[0]?.message?.content || '';
    
    console.log("📝 RESPOSTA_BRUTA da IA (completa):");
    console.log(respostaIA); // RESPOSTA COMPLETA da IA, sem cortar
    console.log("=".repeat(80));

    // 💾 Configurar Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.7.1");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Environment variables not set');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let dadosEstruturados = null;
    let compraId = null;

    // 📊 Tentar processar JSON da IA
    try {
      console.log("🔍 INICIANDO ANÁLISE DA RESPOSTA DA IA");
      console.log("📏 Tamanho da resposta:", respostaIA.length, "caracteres");
      console.log("🎯 Primeiros 200 chars:", respostaIA.substring(0, 200));
      console.log("🏁 Últimos 200 chars:", respostaIA.substring(Math.max(0, respostaIA.length - 200)));
      
      // Limpar resposta da IA para extrair apenas o JSON
      const jsonMatch = respostaIA.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : respostaIA;
      
      console.log("🔧 JSON extraído para parsing:");
      console.log("📏 Tamanho do JSON:", jsonString.length, "caracteres");
      console.log("🎯 Primeiros 300 chars do JSON:", jsonString.substring(0, 300));
      
      dadosEstruturados = JSON.parse(jsonString);
      console.log("✅ JSON parseado com sucesso");
      
      // 🔍 VALIDAÇÕES ESTRUTURAIS DO JSON
      console.log("🧪 INICIANDO VALIDAÇÕES ESTRUTURAIS:");
      
      // Verificar se a IA retornou erro de extração
      if (dadosEstruturados.error === "EXTRACTION_FAILED") {
        console.log("❌ IA retornou EXTRACTION_FAILED:", dadosEstruturados.message);
        throw new Error(dadosEstruturados.message || "Falha na extração: PDF ilegível ou dados insuficientes");
      }
      
      // Validação 1: Estrutura básica
      const estruturaValida = dadosEstruturados && 
                             typeof dadosEstruturados === 'object' &&
                             dadosEstruturados.estabelecimento &&
                             dadosEstruturados.compra &&
                             dadosEstruturados.itens;
      
      console.log("🏗️ Estrutura básica válida:", estruturaValida);
      console.log("🏪 Estabelecimento presente:", !!dadosEstruturados.estabelecimento);
      console.log("🛒 Compra presente:", !!dadosEstruturados.compra);
      console.log("📦 Itens presente:", !!dadosEstruturados.itens);
      
      if (!estruturaValida) {
        console.log("❌ ESTRUTURA INVÁLIDA - Objetos obrigatórios ausentes");
        throw new Error("Estrutura JSON inválida: faltam objetos obrigatórios (estabelecimento, compra, itens)");
      }
      
      // Validação 2: Itens array
      if (!Array.isArray(dadosEstruturados.itens)) {
        console.log("❌ ITENS NÃO É ARRAY:", typeof dadosEstruturados.itens);
        throw new Error("Campo 'itens' deve ser um array");
      }
      
      console.log("📊 Quantidade de itens extraídos:", dadosEstruturados.itens.length);
      
      // Validação 3: Itens básicos
      const itensValidos = dadosEstruturados.itens.every((item: any, index: number) => {
        const valido = item && 
                      typeof item === 'object' &&
                      item.descricao &&
                      typeof item.quantidade === 'number' &&
                      typeof item.valor_unitario === 'number';
        
        if (!valido) {
          console.log(`❌ Item ${index} inválido:`, {
            temDescricao: !!item?.descricao,
            tipoQuantidade: typeof item?.quantidade,
            tipoValorUnitario: typeof item?.valor_unitario,
            item: item
          });
        }
        
        return valido;
      });
      
      console.log("✅ Todos os itens válidos:", itensValidos);
      
      if (!itensValidos) {
        throw new Error("Um ou mais itens têm estrutura inválida (falta descrição, quantidade ou valor_unitario)");
      }
      
      // Validação 4: Estabelecimento
      if (!dadosEstruturados.estabelecimento.nome) {
        console.log("⚠️ Nome do estabelecimento ausente");
      } else {
        console.log("🏪 Nome do estabelecimento:", dadosEstruturados.estabelecimento.nome);
      }
      
      // Validação 5: Chave de acesso
      const chaveAcesso = dadosEstruturados.compra?.chave_acesso;
      if (chaveAcesso) {
        const chaveValida = typeof chaveAcesso === 'string' && chaveAcesso.length >= 43 && chaveAcesso.length <= 44;
        console.log("🔑 Chave de acesso presente:", chaveAcesso.substring(0, 10) + "...");
        console.log("🔑 Chave válida:", chaveValida, "(tamanho:", chaveAcesso.length, ")");
      } else {
        console.log("⚠️ Chave de acesso ausente");
      }
      
      console.log("✅ TODAS AS VALIDAÇÕES PASSARAM - Prosseguindo com o processamento");

      // 🏪 APLICAR NORMALIZAÇÃO DO ESTABELECIMENTO PRIMEIRO
      if (dadosEstruturados.estabelecimento?.nome) {
        console.log(`🏪 Normalizando estabelecimento PDF: "${dadosEstruturados.estabelecimento.nome}"`);
        
        const { data: nomeNormalizado, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
          nome_input: dadosEstruturados.estabelecimento.nome
        });
        
        if (normError) {
          console.error('❌ Erro na normalização PDF:', normError);
        }
        
        const estabelecimentoNormalizado = nomeNormalizado || dadosEstruturados.estabelecimento.nome.toUpperCase();
        dadosEstruturados.estabelecimento.nome = estabelecimentoNormalizado;
        
        console.log(`✅ Estabelecimento PDF normalizado: "${dadosEstruturados.estabelecimento.nome}" → "${estabelecimentoNormalizado}"`);
      }

      // 🏪 CADASTRO AUTOMÁTICO DE SUPERMERCADOS
      let supermercadoId = null;
      if (dadosEstruturados.estabelecimento) {
        const { nome, cnpj: cnpjOriginal, endereco } = dadosEstruturados.estabelecimento;
        
        if (cnpjOriginal) {
          // Normalizar CNPJ (remover pontuação)
          const cnpjLimpo = cnpjOriginal.replace(/[^\d]/g, '');
          
          console.log(`🔍 Processando supermercado PDF - CNPJ: ${cnpjLimpo} (original: ${cnpjOriginal})`);
          
          if (cnpjLimpo.length >= 14) {
            // Buscar supermercado existente por CNPJ normalizado
            let { data: supermercadoExistente } = await supabase
              .from('supermercados')
              .select('id')
              .eq('cnpj', cnpjLimpo)
              .single();

            if (!supermercadoExistente) {
              // Criar novo supermercado automaticamente
              console.log(`🆕 Criando novo supermercado PDF: ${nome}`);
              
              const { data: novoSupermercado, error: errorSupermercado } = await supabase
                .from('supermercados')
                .insert({
                  nome: nome || 'Supermercado',
                  cnpj: cnpjLimpo, // CNPJ normalizado
                  endereco: endereco || null,
                  ativo: true
                })
                .select('id')
                .single();

              if (errorSupermercado) {
                console.error("❌ Erro ao criar supermercado:", errorSupermercado);
              } else {
                supermercadoId = novoSupermercado.id;
                console.log(`✅ Supermercado criado: ID=${supermercadoId}, Nome=${nome}`);
                
                // Geocodificar endereço em background
                if (endereco) {
                  try {
                    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/geocodificar-endereco`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        supermercadoId: novoSupermercado.id,
                        endereco: endereco
                      })
                    });
                    console.log('✅ Geocodificação iniciada para novo supermercado PDF');
                  } catch (geoError) {
                    console.error('⚠️ Erro ao iniciar geocodificação:', geoError);
                  }
                }
              }
            } else {
              supermercadoId = supermercadoExistente.id;
              console.log(`✅ Supermercado encontrado: ID=${supermercadoId}`);
            }
          } else {
            console.log(`❌ CNPJ inválido em PDF: ${cnpjLimpo} (length: ${cnpjLimpo.length})`);
          }
        } else {
          console.log('⚠️ Nenhum CNPJ encontrado nos dados do PDF');
        }
      }

      // 🛒 Criar compra
      if (dadosEstruturados.compra && supermercadoId) {
        const { valor_total, forma_pagamento, data_emissao, numero, serie } = dadosEstruturados.compra;
        
        // Parse da data (formato brasileiro)
        let dataCompra = new Date().toISOString().split('T')[0]; // fallback para hoje
        let horaCompra = null;
        if (data_emissao) {
          try {
            const [dataParte, horaParte] = data_emissao.split(' ');
            const [dia, mes, ano] = dataParte.split('/');
            dataCompra = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            if (horaParte) {
              horaCompra = horaParte;
            }
          } catch (e) {
            console.warn("⚠️ Erro ao parsear data, usando data atual");
          }
        }

        // Buscar ou criar mercado (tabela mercados do usuário)
        let mercadoId = null;
        if (dadosEstruturados.estabelecimento?.nome) {
          const { data: mercadoExistente } = await supabase
            .from('mercados')
            .select('id')
            .eq('user_id', userId)
            .eq('nome', dadosEstruturados.estabelecimento.nome)
            .single();

          if (mercadoExistente) {
            mercadoId = mercadoExistente.id;
          } else {
            // Criar novo mercado
            const { data: novoMercado, error: errorMercado } = await supabase
              .from('mercados')
              .insert({
                user_id: userId,
                nome: dadosEstruturados.estabelecimento.nome,
                bairro: null // Extrair do endereço se necessário
              })
              .select('id')
              .single();

            if (errorMercado) {
              console.error("❌ Erro ao criar mercado:", errorMercado);
            } else {
              mercadoId = novoMercado.id;
              console.log("✅ Mercado criado:", dadosEstruturados.estabelecimento.nome);
              
              // Também criar/atualizar na tabela global de supermercados
              if (dadosEstruturados.estabelecimento.cnpj) {
                try {
                  const cnpjLimpoGlobal = dadosEstruturados.estabelecimento.cnpj.replace(/[^\d]/g, '');
                  const { data: supermercadoGlobal, error: supermercadoError } = await supabase
                    .from('supermercados')
                    .upsert({
                      nome: dadosEstruturados.estabelecimento.nome,
                      cnpj: cnpjLimpoGlobal, // CNPJ normalizado
                      endereco: dadosEstruturados.estabelecimento.endereco || null,
                      ativo: true
                    }, {
                      onConflict: 'cnpj'
                    })
                    .select('id')
                    .single();

                  if (!supermercadoError && supermercadoGlobal) {
                    // Geocodificar endereço do supermercado em background
                    try {
                      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/geocodificar-endereco`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          supermercadoId: supermercadoGlobal.id,
                          endereco: dadosEstruturados.estabelecimento.endereco,
                          cidade: null, // Extrair do endereço se disponível
                          estado: null, // Extrair do endereço se disponível
                          cep: null // Extrair do endereço se disponível
                        })
                      });
                      console.log('✅ Geocodificação iniciada para supermercado');
                    } catch (geoError) {
                      console.error('⚠️ Erro ao iniciar geocodificação:', geoError);
                    }
                  }
                } catch (globalError) {
                  console.error('⚠️ Erro ao criar supermercado global:', globalError);
                }
              }
            }
          }
        }

        const { data: novaCompra, error: errorCompra } = await supabase
          .from('compras_app')
          .insert({
            user_id: userId,
            supermercado_id: supermercadoId,
            data_compra: dataCompra,
            preco_total: valor_total || 0,
            forma_pagamento: forma_pagamento || null,
            numero_nota_fiscal: numero || null,
            status: 'processada'
          })
          .select('id')
          .single();

        if (errorCompra) {
          console.error("❌ Erro ao criar compra:", errorCompra);
        } else {
          compraId = novaCompra.id;
          console.log("✅ Compra criada:", compraId);

          // 📄 Criar nota fiscal no banco compartilhado
          const { data: notaFiscal, error: errorNotaFiscal } = await supabase
            .from('notas_fiscais')
            .insert({
              user_id: userId,
              mercado_id: mercadoId,
              data_compra: dataCompra,
              hora_compra: horaCompra,
              valor_total: valor_total || 0,
              status_processamento: 'processada',
              mercado: dadosEstruturados.estabelecimento?.nome || null,
              cnpj: dadosEstruturados.estabelecimento?.cnpj || null,
              chave_acesso: null, // Pode ser extraído do texto se disponível
              qtd_itens: dadosEstruturados.itens?.length || 0,
               bairro: extrairBairro(dadosEstruturados.estabelecimento?.endereco) || null
            })
            .select('id')
            .single();

          if (errorNotaFiscal) {
            console.error("❌ Erro ao criar nota fiscal:", errorNotaFiscal);
          } else {
            console.log("✅ Nota fiscal criada:", notaFiscal.id);

            // 📝 Criar itens da nota fiscal
            if (dadosEstruturados.itens && dadosEstruturados.itens.length > 0) {
              const itensNotaFiscal = dadosEstruturados.itens.map((item: any) => {
                // Normalizar nome (mesma lógica do estoque)
                let nomeNormalizado = item.descricao.toUpperCase().trim();
                
                // Aplicar normalizações básicas
                nomeNormalizado = nomeNormalizado
                  .replace(/\b(GRAENC|GRANEL)\b/g, 'GRANEL')
                  .replace(/\s+/g, ' ')
                  .trim();

                return {
                  nota_id: notaFiscal.id,
                  descricao: item.descricao || 'Produto não identificado',
                  descricao_normalizada: nomeNormalizado,
                  codigo: item.codigo || null,
                  quantidade: item.quantidade || 1,
                  unidade: item.unidade || 'unidade',
                  valor_unitario: item.valor_unitario || 0,
                  valor_total: item.valor_total || 0,
                  categoria: item.categoria || 'outros',
                  data_compra: dataCompra
                };
              });

              const { error: errorItensNota } = await supabase
                .from('itens_nota')
                .insert(itensNotaFiscal);

              if (errorItensNota) {
                console.error("❌ Erro ao criar itens da nota:", errorItensNota);
              } else {
                console.log(`✅ ${itensNotaFiscal.length} itens da nota fiscal criados`);
              }
            }
          }
        }
      }

      // SEÇÃO DUPLICADA REMOVIDA - a primeira seção já cria notas_fiscais e itens_nota

      // 📦 PROCESSAMENTO DE ESTOQUE REMOVIDO - APENAS IA-2 AUTORIZADA
      console.log("📦 Estoque será processado apenas via IA-2");

      // 🛍️ Processar itens da compra
      if (dadosEstruturados.itens && compraId) {
        for (const item of dadosEstruturados.itens) {
          try {
            const { descricao, codigo, quantidade, unidade, valor_unitario, valor_total, categoria } = item;

            // Buscar ou criar produto
            let produtoId = null;
            let { data: produtoExistente } = await supabase
              .from('produtos_app')
              .select('id')
              .eq('nome', descricao)
              .single();

            if (!produtoExistente) {
              // Buscar categoria ou usar padrão
              // Resolver categoria no escopo do usuário (uuid), nunca em categorias_predefinidas (bigint)
              let categoriaId: string | null = null;
              const nomeCategoria = (categoria && String(categoria).trim()) || 'outros';
              try {
                // Buscar categoria existente do usuário
                const { data: catExistente } = await supabase
                  .from('categorias')
                  .select('id')
                  .eq('user_id', userId)
                  .ilike('nome', `%${nomeCategoria}%`)
                  .maybeSingle();

                if (catExistente?.id) {
                  categoriaId = catExistente.id as string;
                } else {
                  // Criar categoria do usuário se não existir
                  const { data: novaCat, error: errCat } = await supabase
                    .from('categorias')
                    .insert({ user_id: userId, nome: nomeCategoria })
                    .select('id')
                    .single();
                  if (errCat) {
                    console.error('❌ Erro ao criar categoria do usuário:', errCat);
                  } else {
                    categoriaId = novaCat.id as string;
                  }
                }
              } catch (catError) {
                console.error('❌ Falha ao resolver categoria:', catError);
              }

              // Criar produto
              const { data: novoProduto, error: errorProduto } = await supabase
                .from('produtos_app')
                .insert({
                  nome: descricao || 'Produto',
                  codigo_barras: codigo || null,
                  unidade_medida: unidade || 'unidade',
                  categoria_id: categoriaId // Remover o fallback null que pode estar causando problema
                })
                .select('id')
                .single();

              if (errorProduto) {
                console.error("❌ Erro ao criar produto:", errorProduto);
                continue;
              } else {
                produtoId = novoProduto.id;
                console.log("✅ Produto criado:", descricao);
              }
            } else {
              produtoId = produtoExistente.id;
            }

            // Criar item da compra
            const { error: errorItem } = await supabase
              .from('itens_compra_app')
              .insert({
                compra_id: compraId,
                produto_id: produtoId,
                quantidade: quantidade || 0,
                preco_unitario: valor_unitario || 0,
                preco_total: valor_total || 0
              });

            if (errorItem) {
              console.error("❌ Erro ao criar item:", errorItem);
            }

            // ⚠️ ESTOQUE JÁ FOI ATUALIZADO NA SEÇÃO ANTERIOR
            // Remover esta duplicação que estava causando produtos serem marcados como manuais

          } catch (itemError) {
            console.error("❌ Erro ao processar item:", item, itemError);
          }
        }
      }

      // ⚡ COMANDO CRÍTICO: SALVAR CHAVE DE ACESSO DE 44 DÍGITOS PARA VERIFICAÇÃO GLOBAL
      // A IA-1 (validate-receipt) precisa desta chave para evitar duplicatas entre TODOS os usuários
      let chaveAcessoFinal = null;
      
      // Buscar chave de acesso nos dados estruturados (múltiplos locais possíveis)
      if (dadosEstruturados?.compra?.chave_acesso) {
        chaveAcessoFinal = dadosEstruturados.compra.chave_acesso;
      } else if (dadosEstruturados?.chave_acesso) {
        chaveAcessoFinal = dadosEstruturados.chave_acesso;
      }
      
      if (chaveAcessoFinal) {
        const chave = chaveAcessoFinal.toString().replace(/\D/g, '');
        if (chave.length >= 43 && chave.length <= 44) {
          chaveAcessoFinal = chave;
          console.log(`🔑 CHAVE DE ${chave.length} DÍGITOS DETECTADA:`, chave.slice(-6));
          
          // VERIFICAÇÃO DE DUPLICATA ANTES DE PROCESSAR
          const chaveVariations = [
            chave,
            chave.padEnd(44, '0'), // Versão com 44 dígitos se tiver 43
            chave.length === 44 ? chave.slice(0, 43) : null // Versão com 43 se tiver 44
          ].filter(Boolean);

          console.log('🔍 Verificando duplicatas para chaves:', chaveVariations.map(c => c.slice(-6)));
          
          const orConditions = chaveVariations.flatMap(ch => [
            `dados_extraidos->chave_acesso.eq."${ch}"`,
            `dados_extraidos->>chave_acesso.eq."${ch}"`,
            `dados_extraidos->compra->>chave_acesso.eq."${ch}"`
          ]).join(',');

          const { data: existingNotes } = await supabase
            .from('notas_imagens')
            .select('id, created_at, dados_extraidos->compra->>chave_acesso as chave_nota')
            .or(orConditions)
            .eq('processada', true)
            .neq('id', notaImagemId);

          if (existingNotes && existingNotes.length > 0) {
            console.log('🛑 DUPLICATA DETECTADA! Esta nota já foi processada:', existingNotes);
            return new Response(
              JSON.stringify({
                success: false,
                error: 'Nota fiscal duplicada - já foi processada anteriormente',
                details: 'Esta chave de acesso já consta no sistema'
              }),
              { headers: corsHeaders, status: 400 }
            );
          }
          
          // Se chegou aqui, não é duplicata - salvar chave
          dadosEstruturados.chave_acesso = chaveAcessoFinal;
          if (!dadosEstruturados.compra) dadosEstruturados.compra = {};
          dadosEstruturados.compra.chave_acesso = chaveAcessoFinal;
          
          console.log("💾 CHAVE SALVA EM AMBOS OS LOCAIS:", chaveAcessoFinal);
        } else {
          console.log("⚠️ Chave inválida (deve ter 43-44 dígitos):", chave, "Tamanho:", chave.length);
          chaveAcessoFinal = null;
        }
      } else {
        console.log("⚠️ NENHUMA CHAVE DE ACESSO ENCONTRADA NOS DADOS EXTRAÍDOS");
      }

      // 🏪 APLICAR NORMALIZAÇÃO DO ESTABELECIMENTO ANTES DE SALVAR
      if (dadosEstruturados.estabelecimento?.nome) {
        console.log(`🏪 Normalizando estabelecimento PDF: "${dadosEstruturados.estabelecimento.nome}"`);
        
        const { data: nomeNormalizado, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
          nome_input: dadosEstruturados.estabelecimento.nome
        });
        
        if (normError) {
          console.error('❌ Erro na normalização PDF:', normError);
        }
        
        const estabelecimentoNormalizado = nomeNormalizado || dadosEstruturados.estabelecimento.nome.toUpperCase();
        dadosEstruturados.estabelecimento.nome = estabelecimentoNormalizado;
        
        console.log(`✅ Estabelecimento PDF normalizado: "${dadosEstruturados.estabelecimento.nome}" → "${estabelecimentoNormalizado}"`);
      }

      // Marcar nota como processada COM chave de acesso E dados normalizados
      await supabase
        .from("notas_imagens")
        .update({
          processada: true,
          compra_id: compraId,
          dados_extraidos: dadosEstruturados // ← CRÍTICO: Inclui a chave de 44 dígitos E nome normalizado
        })
        .eq("id", notaImagemId);

    // ✅ FLUXO AUTOMÁTICO: IA-1 → IA-2 → IA-3
    console.log("🚀 IA-1 finalizou extração, disparando IA-2 automaticamente...");
    
    // Verificar flag para usar await ou setTimeout
    const useAwaitForIA2 = Deno.env.get('USE_AWAIT_FOR_IA_2') === 'true';
    
    if (useAwaitForIA2) {
      try {
        console.log("T1: chamando IA-2 com AWAIT - nota ID:", notaImagemId);
        const ia2Result = await supabase.functions.invoke('process-receipt-full', {
          body: { notaId: notaImagemId }
        });
        console.log("✅ IA-2 executada com AWAIT com sucesso:", ia2Result.data);
      } catch (ia2Error) {
        console.error("❌ Falha na IA-2 com AWAIT:", ia2Error);
      }
    } else {
      // Manter comportamento original para fallback
      setTimeout(() => {
        console.log("T1: agendei IA-2 - nota ID:", notaImagemId);
        supabase.functions.invoke('process-receipt-full', {
          body: { notaId: notaImagemId }
        }).then((result) => {
          console.log("✅ IA-2 executada automaticamente com sucesso:", result);
        }).catch((estoqueErr) => {
          console.error("❌ Falha na execução automática da IA-2:", estoqueErr);
        })
      }, 0);
    }

    } catch (parseError) {
      console.error("❌ Erro ao processar JSON da IA:", parseError);
      console.log("📝 Resposta bruta da IA:", respostaIA);
    }

    // 💾 Sempre salvar dados de debug COMPLETOS
    try {
      // Salvar texto completo sem truncar
      const textoParaDebug = extractedText.replace(/[^\x20-\x7E\u00C0-\u017F]/g, ' ').replace(/\s+/g, ' ').trim();
      const respostaParaDebug = respostaIA; // Resposta completa da IA

      await supabase
        .from("notas_imagens")
        .update({
          debug_texto: `TEXTO_BRUTO_COMPLETO: ${textoParaDebug}\n\n===RESPOSTA_IA_COMPLETA===\n${respostaParaDebug}`
        })
        .eq("id", notaImagemId);

      console.log("✅ Dados de debug COMPLETOS salvos com sucesso");
    } catch (debugError) {
      console.error("❌ Erro ao salvar debug:", debugError);
    }

    // CHAMADA IA-2 DUPLICADA REMOVIDA - já existe uma chamada em background nas linhas 748-756

    return new Response(JSON.stringify({
      success: true,
      message: "Processamento concluído - TODOS os itens extraídos e categorizados",
      totalItens: dadosEstruturados?.itens?.length || 0,
      texto: textoLimpo.slice(0, 1000), // preview
      textoCompleto: textoLimpo // texto completo na resposta
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("❌ Erro geral:", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ 
        error: "Erro interno no processamento",
        message: err instanceof Error ? err.message : String(err)
    }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});