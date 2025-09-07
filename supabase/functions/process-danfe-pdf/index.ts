import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
   • Compra (valor_total, forma_pagamento, numero, serie, data_emissao)
   • Itens (descrição corrigida, codigo, quantidade, unidade, valor_unitario, valor_total, categoria)

2. Regras OBRIGATÓRIAS:
   - Para VALOR TOTAL: identifique apenas o valor oficial total da compra (ex: 226,29), ignorando números soltos no início do texto.
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
     [Laticínios, Bebidas, Padaria, Mercearia, Hortifruti, Carnes, Higiene, Limpeza, Congelados, Outros]
   - Use "Outros" somente em último caso, quando o produto realmente não pertence a nenhuma dessas categorias.
   - Produtos comuns de mercado devem sempre ser classificados corretamente:
     • Achocolatado → Bebidas ou Mercearia
     • Extrato de tomate → Mercearia  
     • Frutas, verduras, legumes → Hortifruti
   - TODOS os itens DEVEM ter uma categoria obrigatoriamente.
   - O JSON deve estar sempre COMPLETO e bem fechado, válido do início ao fim.
   - NUNCA truncar ou cortar no meio - incluir TODOS os itens da nota.

3. Estrutura OBRIGATÓRIA do retorno:
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
    "data_emissao": "..."
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let dadosEstruturados = null;
    let compraId = null;

    // 📊 Tentar processar JSON da IA
    try {
      // Limpar resposta da IA para extrair apenas o JSON
      const jsonMatch = respostaIA.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : respostaIA;
      
      dadosEstruturados = JSON.parse(jsonString);
      console.log("✅ JSON parseado com sucesso");

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
              bairro: null // Extrair do endereço se necessário
            })
            .select('id')
            .single();

          if (errorNotaFiscal) {
            console.error("❌ Erro ao criar nota fiscal:", errorNotaFiscal);
          } else {
            console.log("✅ Nota fiscal criada:", notaFiscal.id);

            // 📝 Criar itens da nota fiscal
            if (dadosEstruturados.itens && dadosEstruturados.itens.length > 0) {
              const itensNotaFiscal = dadosEstruturados.itens.map(item => {
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
                  categoria: item.categoria || 'outros'
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

      // 📊 Salvar dados na estrutura de notas_fiscais e itens_nota
      let notaFiscalId = null;
      if (dadosEstruturados.estabelecimento && dadosEstruturados.compra) {
        try {
          // Parse da data para o formato correto
          let dataCompra = null;
          if (dadosEstruturados.compra.data_emissao) {
            try {
              const [dataParte] = dadosEstruturados.compra.data_emissao.split(' ');
              const [dia, mes, ano] = dataParte.split('/');
              dataCompra = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            } catch (e) {
              console.warn("⚠️ Erro ao parsear data para nota fiscal");
            }
          }

           // Criar registro na tabela notas_fiscais
           const cnpjNotaFiscal = dadosEstruturados.estabelecimento.cnpj ? 
             dadosEstruturados.estabelecimento.cnpj.replace(/[^\d]/g, '') : '';
           const { data: notaFiscal, error: errorNotaFiscal } = await supabase
             .from('notas_fiscais')
             .insert({
               user_id: userId,
               mercado: dadosEstruturados.estabelecimento.nome || 'Não identificado',
               cnpj: cnpjNotaFiscal,
              bairro: null, // Extrair do endereço se necessário
              data_compra: dataCompra,
              valor_total: dadosEstruturados.compra.valor_total || 0,
              qtd_itens: dadosEstruturados.itens?.length || 0,
              chave_acesso: null // Adicionar se disponível na nota
            })
            .select('id')
            .single();

          if (errorNotaFiscal) {
            console.error("❌ Erro ao criar nota fiscal:", errorNotaFiscal);
          } else {
            notaFiscalId = notaFiscal.id;
            console.log("✅ Nota fiscal criada:", notaFiscalId);
          }
        } catch (notaError) {
          console.error("❌ Erro ao processar nota fiscal:", notaError);
        }
      }

      // 📊 Salvar itens da nota
      if (dadosEstruturados.itens && notaFiscalId) {
        for (const item of dadosEstruturados.itens) {
          try {
            const { descricao, codigo, quantidade, unidade, valor_unitario, valor_total, categoria } = item;

            // Salvar item da nota
            await supabase
              .from('itens_nota')
              .insert({
                nota_id: notaFiscalId,
                descricao: descricao || 'Item não identificado',
                codigo: codigo || null,
                quantidade: quantidade || 0,
                unidade: unidade || 'unidade',
                valor_unitario: valor_unitario || 0,
                valor_total: valor_total || 0,
                categoria: categoria || 'outros'
              });

            // Atualizar preços atuais de forma inteligente considerando data/hora
            if (descricao && valor_unitario && dadosEstruturados.estabelecimento?.cnpj) {
              try {
                // Usar a função especializada que considera data/hora e área de atuação
                await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/update-precos-atuais`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    compraId: compra?.id,
                    produtoNome: descricao,
                    precoUnitario: valor_unitario,
                    estabelecimentoCnpj: dadosEstruturados.estabelecimento.cnpj?.replace(/[^\d]/g, '') || '',
                    estabelecimentoNome: dadosEstruturados.estabelecimento.nome || 'Não informado',
                    dataCompra: dadosEstruturados.compra?.data_emissao,
                    horaCompra: dadosEstruturados.compra?.hora_emissao,
                    userId: userId
                  })
                });
                
                console.log(`✅ Preço atual processado para: ${descricao}`);
              } catch (precoError) {
                console.error('Erro ao processar preço atual:', precoError);
              }
            }

            console.log(`✅ Item da nota salvo: ${descricao}`);
          } catch (itemError) {
            console.error("❌ Erro ao salvar item da nota:", item, itemError);
          }
        }
      }

      // 📦 Atualizar estoque do usuário
      if (dadosEstruturados.itens && userId) {
        console.log("📦 Iniciando atualização do estoque...");
        for (let idx = 0; idx < dadosEstruturados.itens.length; idx++) {
          const item = dadosEstruturados.itens[idx];
          try {
            const { descricao, quantidade, unidade, valor_unitario, categoria } = item;

            // 📦 Normalizar nome do produto
            const nomeNormalizado = descricao
              ?.replace(/\b(GRAENC|GRANEL)\b/gi, 'GRANEL')
              ?.replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b/gi, 'PAO DE FORMA')
              ?.replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|\d+G|\d+ML|\d+L)\b/gi, '')
              ?.replace(/\s+/g, ' ')
              ?.trim()
              ?.toUpperCase() || 'PRODUTO';

            console.log(`\n🔍 PROCESSANDO ITEM ${idx + 1}: "${descricao}"`);
            console.log(`   - Nome normalizado: "${nomeNormalizado}"`);
            console.log(`   - Quantidade: ${quantidade}`);
            console.log(`   - Valor unitário: ${valor_unitario}`);
            console.log(`   - Valor total: ${valor_total}`);
            console.log(`   - Categoria: ${categoria}`);
            console.log(`   - Unidade: ${unidade}`);

            // 📊 Verificar se produto já existe no estoque
            const { data: estoqueExistente } = await supabase
              .from('estoque_app')
              .select('id, quantidade, preco_unitario_ultimo')
              .eq('user_id', userId)
              .eq('produto_nome', nomeNormalizado)
              .single();

            console.log(`🔍 VERIFICAÇÃO ESTOQUE - Item ${idx + 1}:`);
            if (estoqueExistente) {
              console.log(`   ✅ PRODUTO ENCONTRADO NO ESTOQUE:`);
              console.log(`      - ID: ${estoqueExistente.id}`);
              console.log(`      - Quantidade atual: ${estoqueExistente.quantidade}`);
              console.log(`      - Preço atual: ${estoqueExistente.preco_unitario_ultimo}`);
              console.log(`      - Quantidade a adicionar: ${quantidade}`);
              console.log(`      - Novo preço: ${valor_unitario || 0}`);

              // Atualizar quantidade existente
              const { error: updateError } = await supabase
                .from('estoque_app')
                .update({
                  quantidade: estoqueExistente.quantidade + (quantidade || 0),
                  preco_unitario_ultimo: valor_unitario || 0
                })
                .eq('id', estoqueExistente.id);

              if (updateError) {
                console.error(`❌ ERRO ao atualizar estoque - Item ${idx + 1}:`, updateError);
              } else {
                console.log(`✅ SUCESSO - Item ${idx + 1} ATUALIZADO: ${nomeNormalizado} (${estoqueExistente.quantidade} + ${quantidade} = ${estoqueExistente.quantidade + (quantidade || 0)}) - Preço: R$ ${valor_unitario || 0}`);
              }
            } else {
              console.log(`   🆕 PRODUTO NÃO ENCONTRADO - CRIANDO NOVO:`);
              console.log(`      - Nome: ${nomeNormalizado}`);
              console.log(`      - Quantidade: ${quantidade}`);
              console.log(`      - Preço: ${valor_unitario || 0}`);
              console.log(`      - Categoria: ${categoria || 'outros'}`);

              // Criar novo item no estoque
              const { error: insertError } = await supabase
                .from('estoque_app')
                .insert({
                  user_id: userId,
                  produto_nome: nomeNormalizado,
                  categoria: categoria || 'outros',
                  quantidade: quantidade || 0,
                  unidade_medida: unidade || 'unidade',
                  preco_unitario_ultimo: valor_unitario || 0
                });

              if (insertError) {
                console.error(`❌ ERRO ao criar produto - Item ${idx + 1}:`, insertError);
              } else {
                console.log(`✅ SUCESSO - Item ${idx + 1} CRIADO: ${nomeNormalizado} (${quantidade}) - Preço: R$ ${valor_unitario || 0}`);
              }
            }

          } catch (estoqueError) {
            console.error("❌ Erro ao atualizar estoque:", item, estoqueError);
          }
        }
        console.log("✅ Atualização do estoque concluída");
      }

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
              let categoriaId = null;
              if (categoria) {
                const { data: categoriaExistente } = await supabase
                  .from('categorias_predefinidas')
                  .select('id')
                  .ilike('nome', `%${categoria}%`)
                  .single();

                if (categoriaExistente) {
                  categoriaId = categoriaExistente.id;
                } else {
                  // Criar categoria se não existir
                  const { data: novaCategoria } = await supabase
                    .from('categorias_predefinidas')
                    .insert({ nome: categoria })
                    .select('id')
                    .single();
                  
                  if (novaCategoria) categoriaId = novaCategoria.id;
                }
              }

              // Criar produto
              const { data: novoProduto, error: errorProduto } = await supabase
                .from('produtos_app')
                .insert({
                  nome: descricao || 'Produto',
                  codigo_barras: codigo || null,
                  unidade_medida: unidade || 'unidade',
                  categoria_id: categoriaId || null
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

            // Atualizar estoque
            const { data: estoqueExistente, error: errorBuscarEstoque } = await supabase
              .from('estoque_app')
              .select('id, quantidade')
              .eq('user_id', userId)
              .eq('produto_nome', descricao)
              .single();

            if (estoqueExistente) {
              // Atualizar quantidade existente
              await supabase
                .from('estoque_app')
                .update({
                  quantidade: estoqueExistente.quantidade + (quantidade || 0),
                  preco_unitario_ultimo: valor_unitario || 0
                })
                .eq('id', estoqueExistente.id);
            } else {
              // Criar novo item no estoque
              await supabase
                .from('estoque_app')
                .insert({
                  user_id: userId,
                  produto_nome: descricao || 'Produto',
                  categoria: categoria || 'outros',
                  quantidade: quantidade || 0,
                  unidade_medida: unidade || 'unidade',
                  preco_unitario_ultimo: valor_unitario || 0
                });
            }

          } catch (itemError) {
            console.error("❌ Erro ao processar item:", item, itemError);
          }
        }
      }

      // Marcar nota como processada
      await supabase
        .from("notas_imagens")
        .update({
          processada: true,
          compra_id: compraId,
          dados_extraidos: dadosEstruturados
        })
        .eq("id", notaImagemId);

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
    console.error("❌ Erro geral:", err.message);
    return new Response(JSON.stringify({
      success: false,
      error: "GENERAL_ERROR",
      message: err.message
    }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});