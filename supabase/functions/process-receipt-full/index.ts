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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { imagemId } = await req.json();

    if (!imagemId) {
      return new Response(
        JSON.stringify({ error: 'ID da imagem é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Processando nota fiscal: ${imagemId}`);

    // Buscar nota existente
    const { data: notaImagem, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', imagemId)
      .single();

    if (notaError || !notaImagem) {
      throw new Error(`Nota não encontrada: ${notaError?.message}`);
    }

    if (!notaImagem.dados_extraidos) {
      throw new Error('Nota ainda não foi processada pela IA');
    }

    const extractedData = notaImagem.dados_extraidos as any;
    console.log('✅ Dados extraídos carregados');

    // 🏪 APLICAR NORMALIZAÇÃO DO ESTABELECIMENTO LOGO NO INÍCIO
    const nomeOriginalEstabelecimento = extractedData?.supermercado?.nome || 
                                      extractedData?.estabelecimento?.nome || 
                                      extractedData?.emitente?.nome;
    
    if (nomeOriginalEstabelecimento && typeof nomeOriginalEstabelecimento === 'string') {
      console.log(`🏪 Normalizando estabelecimento: "${nomeOriginalEstabelecimento}"`);
      
      const { data: nomeNormalizado, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
        nome_input: nomeOriginalEstabelecimento
      });
      
      if (normError) {
        console.error('❌ Erro na normalização:', normError);
      }
      
      const estabelecimentoNormalizado = nomeNormalizado || nomeOriginalEstabelecimento.toUpperCase();
      
      // Aplicar normalização em todos os locais possíveis nos dados extraídos
      if (extractedData.supermercado) {
        extractedData.supermercado.nome = estabelecimentoNormalizado;
      }
      if (extractedData.estabelecimento) {
        extractedData.estabelecimento.nome = estabelecimentoNormalizado;
      }
      if (extractedData.emitente) {
        extractedData.emitente.nome = estabelecimentoNormalizado;
      }
      
      // 💾 Salvar dados normalizados de volta na tabela notas_imagens
        const { error: updateError } = await supabase
          .from('notas_imagens')
          .update({ 
            dados_extraidos: extractedData,
            updated_at: new Date().toISOString()
          })
          .eq('id', imagemId);
      
      if (updateError) {
        console.error('❌ Erro ao salvar dados normalizados:', updateError);
      } else {
        console.log(`✅ Estabelecimento normalizado: "${nomeOriginalEstabelecimento}" → "${estabelecimentoNormalizado}"`);
      }
    } else {
      console.log('⚠️ Nome do estabelecimento não encontrado ou inválido');
    }

    // 🧠 Função avançada para normalizar nomes de produtos usando IA-2
    const normalizarNomeProduto = async (nome: string): Promise<{ nomeNormalizado: string, dadosCompletos?: any }> => {
      if (!nome) return { nomeNormalizado: '' };
      
      try {
        // Tentar normalização com IA-2 primeiro
        console.log(`🤖 Tentando normalização IA-2 para: ${nome}`);
        
        const { data: normalizacaoResponse, error: normalizacaoError } = await supabase.functions.invoke('normalizar-produto-ia2', {
          body: { nomeOriginal: nome }
        });

        if (!normalizacaoError && normalizacaoResponse?.produto_nome_normalizado) {
          console.log(`✅ IA-2 normalizou: ${nome} -> ${normalizacaoResponse.produto_nome_normalizado}`);
          return { 
            nomeNormalizado: normalizacaoResponse.produto_nome_normalizado,
            dadosCompletos: normalizacaoResponse
          };
        }
        
        console.log(`⚠️ IA-2 falhou para "${nome}", usando fallback básico`);
      } catch (error) {
        console.log(`⚠️ Erro na IA-2 para "${nome}": ${error.message}, usando fallback`);
      }

      // Fallback: normalização básica
      let nomeNormalizado = nome.toUpperCase().trim();
      
      // 1. Aplicar normalizações da tabela
      const { data: normalizacoes } = await supabase
        .from('normalizacoes_nomes')
        .select('termo_errado, termo_correto')
        .eq('ativo', true);
      
      if (normalizacoes) {
        for (const norm of normalizacoes) {
          const regex = new RegExp(`\\b${norm.termo_errado}\\b`, 'gi');
          nomeNormalizado = nomeNormalizado.replace(regex, norm.termo_correto);
        }
      }
      
      // 2. Aplicar normalizações específicas
      nomeNormalizado = nomeNormalizado
        .replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b/gi, 'PAO DE FORMA')
        .replace(/\b(ACHOCOLATADO EM PO NESCAU)\s*(380G|3\.0|30KG|\d+G)?\b/gi, 'ACHOCOLATADO EM PO')
        .replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL|\d+G|\d+ML|\d+L|\d+KG)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      return { nomeNormalizado };
    };

    // Função para calcular similaridade entre strings
    const calcularSimilaridade = (str1: string, str2: string): number => {
      const len1 = str1.length;
      const len2 = str2.length;
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
    // Verifica tanto 'produtos' quanto 'itens' para compatibilidade
    const listaItens = extractedData.produtos || extractedData.itens;
    if (listaItens && Array.isArray(listaItens)) {
      console.log('📦 Atualizando estoque automaticamente...');
      
      for (let index = 0; index < listaItens.length; index++) {
        const produtoData = listaItens[index];
        try {
          // Compatibilidade entre diferentes formatos de dados (produtos vs itens)
          const nomeProduto = produtoData.nome || produtoData.descricao;
          const quantidadeProduto = produtoData.quantidade;
          const precoUnitario = produtoData.precoUnitario || produtoData.valor_unitario;
          const precoTotal = produtoData.precoTotal || produtoData.valor_total;
          const categoriaProduto = produtoData.categoria;
          const unidadeProduto = produtoData.unidade;

          console.log(`\n🔍 PROCESSANDO ITEM ${index + 1}: "${nomeProduto}"`);
          console.log(`   - Quantidade: ${quantidadeProduto}`);
          console.log(`   - Preço unitário: ${precoUnitario}`);
          console.log(`   - Preço total: ${precoTotal}`);
          console.log(`   - Categoria: ${categoriaProduto}`);
          
          const resultadoNormalizacao = await normalizarNomeProduto(nomeProduto);
          const nomeNormalizado = resultadoNormalizacao.nomeNormalizado;
          const dadosNormalizados = resultadoNormalizacao.dadosCompletos;
          console.log(`🏷️ Original: "${nomeProduto}" -> Normalizado: "${nomeNormalizado}"`);

          if (!nomeProduto || !quantidadeProduto) {
            console.log(`⚠️ Item ${index + 1} ignorado: dados incompletos`);
            continue;
          }

          // Buscar lista completa do estoque do usuário
          const { data: estoqueLista, error: estoqueListaError } = await supabase
            .from('estoque_app')
            .select('*')
            .eq('user_id', notaImagem.usuario_id);

          if (estoqueListaError) {
            console.error(`❌ Erro ao buscar lista de estoque para item ${index + 1}:`, estoqueListaError);
            continue;
          }

          // 🎯 Procurar produto similar usando algoritmo inteligente
          let produtoSimilar = null;
          if (estoqueLista && estoqueLista.length > 0) {
            console.log(`🔍 Buscando produto similar para "${nomeNormalizado}" em ${estoqueLista.length} itens do estoque...`);
            
            // Primeiro: tentar match exato com o nome normalizado ou hash
            for (const prod of estoqueLista) {
              const resultadoNormalizacaoEstoque = await normalizarNomeProduto(prod.produto_nome);
              const produtoNomeNormalizado = resultadoNormalizacaoEstoque.nomeNormalizado;
              
              // Match por nome normalizado ou hash (se disponível)
              const matchExato = produtoNomeNormalizado === nomeNormalizado ||
                (dadosNormalizados?.produto_hash_normalizado && 
                 prod.produto_hash_normalizado === dadosNormalizados.produto_hash_normalizado);
              
              if (matchExato) {
                produtoSimilar = prod;
                console.log(`✅ Match EXATO encontrado: "${prod.produto_nome}" (ID: ${prod.id})`);
                break;
              }
            }

            // Se não encontrou match exato, usar similaridade
            if (!produtoSimilar) {
              let melhorSimilaridade = 0;
              for (const item of estoqueLista) {
                const similaridade = calcularSimilaridade(
                  nomeNormalizado.toLowerCase(),
                  item.produto_nome.toLowerCase()
                );
                console.log(`   📊 Similaridade com "${item.produto_nome}": ${(similaridade * 100).toFixed(1)}%`);
                if (similaridade >= 0.85 && similaridade > melhorSimilaridade) {
                  melhorSimilaridade = similaridade;
                  produtoSimilar = item;
                  console.log(`   🎯 Novo melhor match: "${item.produto_nome}" (${(similaridade * 100).toFixed(1)}%)`);
                }
              }
            }
          }

          if (produtoSimilar) {
            // 📈 Atualizar produto existente
            const novaQuantidade = produtoSimilar.quantidade + (quantidadeProduto || 1);
            
            // CORREÇÃO CRÍTICA: SEMPRE usar o preço da nota fiscal se existir
            const precoAtualizado = precoUnitario || produtoSimilar.preco_unitario_ultimo || 0;
            
            console.log(`🔍 COMPARAÇÃO DETALHADA - ITEM ${index + 1}`);
            console.log(`   ✅ PRODUTO ENCONTRADO NO ESTOQUE:`);
            console.log(`      - ID do produto: ${produtoSimilar.id}`);
            console.log(`      - Nome no estoque: "${produtoSimilar.produto_nome}"`);
            console.log(`      - Nome normalizado: "${nomeNormalizado}"`);
            console.log(`   💰 PREÇOS:`);
            console.log(`      - Preço da nota fiscal: ${precoUnitario}`);
            console.log(`      - Preço atual no estoque: ${produtoSimilar.preco_unitario_ultimo}`);
            console.log(`      - Preço que será salvo: ${precoAtualizado}`);
            console.log(`   📦 QUANTIDADES:`);
            console.log(`      - Quantidade anterior: ${produtoSimilar.quantidade}`);
            console.log(`      - Quantidade a adicionar: ${quantidadeProduto}`);
            console.log(`      - Nova quantidade total: ${novaQuantidade}`);
            
            const { error: updateError } = await supabase
              .from('estoque_app')
              .update({
                quantidade: novaQuantidade,
                preco_unitario_ultimo: precoAtualizado,
                updated_at: new Date().toISOString()
              })
              .eq('id', produtoSimilar.id);

            if (updateError) {
              console.error(`❌ ERRO ao atualizar estoque - Item ${index + 1}:`, updateError);
              continue;
            }

            console.log(`✅ SUCESSO - Item ${index + 1} ATUALIZADO:`);
            console.log(`   - Produto: ${nomeNormalizado}`);
            console.log(`   - Quantidade: ${novaQuantidade} ${unidadeProduto || 'unidade'}`);
            console.log(`   - Preço: R$ ${precoAtualizado}`);
            
          } else {
            console.log(`🆕 CRIANDO NOVO ITEM ${index + 1} - "${nomeNormalizado}"`);
            console.log(`   - Preço unitário: ${precoUnitario}`);
            console.log(`   - Quantidade: ${quantidadeProduto}`);
            console.log(`   - Categoria: ${categoriaProduto}`);
            
            // 📈 Criar novo produto no estoque - GARANTIR que sempre tenha preço
            const precoParaSalvar = precoUnitario && precoUnitario > 0 
              ? precoUnitario 
              : 0.01; // Preço mínimo para evitar zeros
              
            // Preparar dados para inserção (com campos normalizados)
            const dadosParaInserir = {
              user_id: notaImagem.usuario_id,
              produto_nome: nomeNormalizado,
              categoria: categoriaProduto || 'outros',
              unidade_medida: unidadeProduto || 'unidade',
              quantidade: quantidadeProduto || 1,
              preco_unitario_ultimo: precoParaSalvar,
              origem: 'nota_fiscal'
            };

            // Adicionar campos normalizados se disponíveis
            if (dadosNormalizados) {
              dadosParaInserir.produto_nome_normalizado = dadosNormalizados.produto_nome_normalizado;
              dadosParaInserir.nome_base = dadosNormalizados.nome_base;
              dadosParaInserir.marca = dadosNormalizados.marca;
              dadosParaInserir.tipo_embalagem = dadosNormalizados.tipo_embalagem;
              dadosParaInserir.qtd_valor = dadosNormalizados.qtd_valor;
              dadosParaInserir.qtd_unidade = dadosNormalizados.qtd_unidade;
              dadosParaInserir.qtd_base = dadosNormalizados.qtd_base;
              dadosParaInserir.granel = dadosNormalizados.granel;
              dadosParaInserir.produto_hash_normalizado = dadosNormalizados.produto_hash_normalizado;
            }
              
            const { error: insertError } = await supabase
              .from('estoque_app')
              .insert(dadosParaInserir);

            if (insertError) {
              console.error(`❌ ERRO ao criar produto - Item ${index + 1}:`, insertError);
              continue;
            }

            console.log(`✅ SUCESSO - Item ${index + 1} CRIADO:`);
            console.log(`   - Produto: ${nomeNormalizado}`);
            console.log(`   - Quantidade: ${quantidadeProduto} ${unidadeProduto || 'unidade'}`);
            console.log(`   - Preço: R$ ${precoUnitario || 0}`);
          }

          // === Atualização do Preço Atual (precos_atuais) baseada na nota fiscal ===
          try {
            const dados = extractedData || {};
            const cnpjNota = dados?.supermercado?.cnpj || dados?.cnpj || dados?.estabelecimento?.cnpj || dados?.emitente?.cnpj;
            const estabelecimentoNomeOriginal = dados?.supermercado?.nome || dados?.estabelecimento?.nome || dados?.emitente?.nome || 'DESCONHECIDO';
            
            // 🏪 Normalizar nome do estabelecimento usando a função do banco
            const { data: nomeNormalizado } = await supabase.rpc('normalizar_nome_estabelecimento', {
              nome_input: estabelecimentoNomeOriginal
            });
            const estabelecimentoNome = nomeNormalizado || estabelecimentoNomeOriginal.toUpperCase();
            
            const cnpjLimpo = cnpjNota ? String(cnpjNota).replace(/[^\d]/g, '') : null;

            // Extrair data/hora da compra e transformar em ISO
            const dataStrRaw = dados?.compra?.data_compra || dados?.compra?.data_emissao || dados?.dataCompra || dados?.data || dados?.emissao || null;
            const horaStr = dados?.compra?.hora_compra || dados?.hora || dados?.horaCompra || null;

            let dataStr = dataStrRaw ? String(dataStrRaw) : '';
            if (dataStr && /^(\d{2})\/(\d{2})\/(\d{4})$/.test(dataStr)) {
              const [d, m, y] = dataStr.split('/');
              dataStr = `${y}-${m}-${d}`;
            }
            const dataISO = new Date(`${dataStr || new Date().toISOString().slice(0,10)}T${horaStr || '00:00:00'}`).toISOString();

            if (cnpjLimpo && nomeNormalizado && Number(precoUnitario) > 0) {
              console.log(`🧾 Atualizando precos_atuais -> ${nomeNormalizado} @ ${cnpjLimpo} (${estabelecimentoNome}) = R$ ${precoUnitario} em ${dataISO}`);

              const { data: existente } = await supabase
                .from('precos_atuais')
                .select('id, valor_unitario, data_atualizacao')
                .eq('produto_nome', nomeNormalizado)
                .eq('estabelecimento_cnpj', cnpjLimpo)
                .maybeSingle();

              let deveAtualizar = false;
              if (!existente) {
                deveAtualizar = true;
              } else {
                const tExist = new Date(existente.data_atualizacao).getTime();
                const tNova = new Date(dataISO).getTime();
                const precoExist = Number(existente.valor_unitario);
                const precoNovo = Number(precoUnitario);

                if (tNova > tExist && precoNovo < precoExist) {
                  // Nova compra é mais recente e preço menor -> atualizar
                  deveAtualizar = true;
                  console.log('✅ Regra: mais recente + menor preço (atualizando)');
                } else if (tNova === tExist && precoNovo < precoExist) {
                  // Mesma data, preço menor -> atualizar
                  deveAtualizar = true;
                  console.log('✅ Regra: mesma data com preço menor (atualizando)');
                } else {
                  console.log('ℹ️ Mantendo preço existente em precos_atuais');
                }
              }

              if (deveAtualizar) {
                // Preparar dados para upsert com campos normalizados
                const dadosPreco = {
                  produto_nome: nomeNormalizado,
                  estabelecimento_cnpj: cnpjLimpo,
                  estabelecimento_nome: estabelecimentoNome,
                  valor_unitario: Number(precoUnitario),
                  data_atualizacao: dataISO,
                };

                // Adicionar campos normalizados se disponíveis
                if (dadosNormalizados) {
                  dadosPreco.produto_nome_normalizado = dadosNormalizados.produto_nome_normalizado;
                  dadosPreco.nome_base = dadosNormalizados.nome_base;
                  dadosPreco.marca = dadosNormalizados.marca;
                  dadosPreco.tipo_embalagem = dadosNormalizados.tipo_embalagem;
                  dadosPreco.qtd_valor = dadosNormalizados.qtd_valor;
                  dadosPreco.qtd_unidade = dadosNormalizados.qtd_unidade;
                  dadosPreco.qtd_base = dadosNormalizados.qtd_base;
                  dadosPreco.granel = dadosNormalizados.granel;
                  dadosPreco.produto_hash_normalizado = dadosNormalizados.produto_hash_normalizado;
                }

                const { error: upsertErr } = await supabase
                  .from('precos_atuais')
                  .upsert(dadosPreco, { onConflict: 'produto_nome,estabelecimento_cnpj' });

                if (upsertErr) {
                  console.error('❌ Erro ao atualizar precos_atuais:', upsertErr);
                } else {
                  console.log('💾 precos_atuais atualizado com sucesso');
                }
              }
            }
          } catch (e) {
            console.error('⚠️ Falha ao atualizar precos_atuais (não crítico):', e);
          }
        } catch (error) {
          console.error(`❌ Erro ao processar item ${index + 1} (${nomeProduto}):`, error);
        }
      }
    }

    // Atualizar dados da nota
    const { error: updateError } = await supabase
      .from('notas_imagens')
      .update({
        processada: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', imagemId);

    if (updateError) {
      console.error('❌ Erro ao atualizar nota:', updateError);
    }

    console.log('✅ Processamento completo da nota fiscal!');

    // 🔧 Executar correção automática de preços zerados
    try {
      console.log('🔧 Executando correção automática de preços...');
      const { data: correcaoResult, error: correcaoError } = await supabase.functions.invoke('fix-precos-automatico', {
        body: { userId: notaImagem.usuario_id }
      });
      
      if (correcaoError) {
        console.error('⚠️ Erro na correção automática (não crítico):', correcaoError);
      } else {
        console.log('✅ Correção automática executada:', correcaoResult);
      }
    } catch (error) {
      console.error('⚠️ Erro na correção automática (não crítico):', error);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Nota fiscal processada e estoque atualizado com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});