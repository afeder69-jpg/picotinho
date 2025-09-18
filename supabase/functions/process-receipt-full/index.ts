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

    // Extrair dados da nota uma única vez
    const extractedData = notaImagem.dados_extraidos as any;
    
    // ✅ SIMPLIFICADO: Confiar na IA-1 para validação de duplicidade
    // Se a nota chegou aqui, ela é inédita e deve ser processada normalmente
    console.log(`🚀 Processando nota inédita validada pela IA-1: ${imagemId}`);
    console.log('✅ Dados extraídos carregados - iniciando inserção direta no estoque');

    // Verificar se há produtos para processar
    const listaItens = extractedData.produtos || extractedData.itens;
    if (!listaItens || !Array.isArray(listaItens) || listaItens.length === 0) {
      throw new Error('Nota não contém produtos válidos para processar');
    }

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

    // Buscar estoque do usuário uma única vez para otimizar performance
    const { data: estoqueCompleto, error: estoqueError } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', notaImagem.usuario_id);

    if (estoqueError) {
      console.error('⚠️ Erro ao buscar estoque:', estoqueError);
    }

    // ✅ PROCESSA PRODUTOS - APENAS GRAVA EXATAMENTE O QUE A IA-2 ENTREGOU
    if (listaItens && Array.isArray(listaItens)) {
      console.log(`📦 Gravando no estoque EXATAMENTE como a IA-2 entregou - ${listaItens.length} itens...`);
      
      let itensProcessados = 0;
      let itensAtualizados = 0;
      let itensCriados = 0;
      let itensComErro = 0;
      
      for (let index = 0; index < listaItens.length; index++) {
        const item = listaItens[index];
        try {
          // ✅ USAR EXATAMENTE OS DADOS DA IA-2 - SEM REINTERPRETAÇÃO
          const nomeExato = item.nome || item.descricao;
          const quantidadeExata = item.quantidade;
          const precoUnitarioExato = item.precoUnitario || item.valor_unitario;
          const precoTotalExato = item.precoTotal || item.valor_total;
          const categoriaExata = item.categoria || 'outros';
          const unidadeExata = item.unidade || 'UN';

          console.log(`\n🔍 PROCESSANDO ITEM ${index + 1}: "${nomeExato}"`);
          console.log(`   - Quantidade: ${quantidadeExata}`);
          console.log(`   - Preço unitário: ${precoUnitarioExato}`);
          console.log(`   - Preço total: ${precoTotalExato}`);
          console.log(`   - Categoria: ${categoriaExata}`);

          if (!nomeExato || nomeExato.trim() === '') {
            console.log(`⚠️ Item ${index + 1} ignorado: nome vazio`);
            continue;
          }

          // 🔍 Buscar produto existente no estoque (sem reprocessar)
          let produtoExistente = null;
          if (estoqueCompleto && !estoqueError) {
            // Busca por nome exato (sem normalização adicional)
            produtoExistente = estoqueCompleto.find(p => 
              p.produto_nome.toUpperCase().trim() === nomeExato.toUpperCase().trim()
            );
            
            if (produtoExistente) {
              console.log(`✅ Produto encontrado no estoque: "${produtoExistente.produto_nome}" (ID: ${produtoExistente.id})`);
            }
          }

          if (produtoExistente) {
            // ✅ ATUALIZAR PRODUTO EXISTENTE - VALORES EXATOS DA IA-2
            let novaQuantidade;
            if (notaImagem.processada) {
              // Nota já processada = SUBSTITUIR quantidade
              novaQuantidade = quantidadeExata;
              console.log(`🔄 SUBSTITUINDO quantidade (nota já processada): ${produtoExistente.quantidade} → ${quantidadeExata}`);
            } else {
              // Primeira vez = SOMAR quantidade
              novaQuantidade = produtoExistente.quantidade + quantidadeExata;
              console.log(`➕ SOMANDO quantidade (primeira vez): ${produtoExistente.quantidade} + ${quantidadeExata} = ${novaQuantidade}`);
            }
            
            console.log(`🔍 COMPARAÇÃO DETALHADA - ITEM ${index + 1}`);
            console.log(`   ✅ PRODUTO ENCONTRADO NO ESTOQUE:`);
            console.log(`      - ID do produto: ${produtoExistente.id}`);
            console.log(`      - Nome no estoque: "${produtoExistente.produto_nome}"`);
            console.log(`      - Nome normalizado: "${nomeExato}"`);
            console.log(`   💰 PREÇOS:`);
            console.log(`      - Preço da nota fiscal: ${precoUnitarioExato}`);
            console.log(`      - Preço atual no estoque: ${produtoExistente.preco_unitario_ultimo}`);
            console.log(`      - Preço que será salvo: ${precoUnitarioExato}`);
            console.log(`   📦 QUANTIDADES:`);
            console.log(`      - Quantidade anterior: ${produtoExistente.quantidade}`);
            console.log(`      - Quantidade a adicionar: ${quantidadeExata}`);
            console.log(`      - Nova quantidade total: ${novaQuantidade}`);
            
            const { error: updateError } = await supabase
              .from('estoque_app')
              .update({
                quantidade: novaQuantidade,
                preco_unitario_ultimo: precoUnitarioExato,
                updated_at: new Date().toISOString()
              })
              .eq('id', produtoExistente.id);

            if (updateError) {
              console.error(`❌ ERRO ao atualizar estoque - Item ${index + 1}:`, updateError);
              itensComErro++;
              continue;
            }

            console.log(`✅ SUCESSO - Item ${index + 1} ATUALIZADO:`);
            console.log(`   - Produto: ${nomeExato}`);
            console.log(`   - Quantidade: ${novaQuantidade} ${unidadeExata}`);
            console.log(`   - Preço: R$ ${precoUnitarioExato}`);
            itensProcessados++;
            itensAtualizados++;
            
          } else {
            // ✅ CRIAR NOVO PRODUTO - VALORES EXATOS DA IA-2
            console.log(`🆕 CRIANDO NOVO ITEM ${index + 1} - "${nomeExato}"`);
            console.log(`   - Preço unitário: ${precoUnitarioExato}`);
            console.log(`   - Quantidade: ${quantidadeExata}`);
            console.log(`   - Categoria: ${categoriaExata}`);
            
            // Mapear categoria para valores aceitos pela constraint
            const mapearCategoria = (categoria: string): string => {
              if (!categoria) return 'outros';
              
              const cat = String(categoria).toLowerCase().trim();
              const mapeamento = {
                'bebidas': 'bebidas',
                'limpeza': 'limpeza',
                'higiene': 'higiene',
                'alimentação': 'alimentacao',
                'alimentacao': 'alimentacao',
                'padaria': 'padaria',
                'açougue': 'acougue',
                'acougue': 'acougue',
                'frutas': 'frutas',
                'verduras': 'verduras',
                'frios': 'frios',
                'congelados': 'congelados',
                'casa': 'casa',
                'papelaria': 'papelaria'
              };
              
              return mapeamento[cat] || 'outros';
            };
            
            const categoriaFinal = mapearCategoria(categoriaExata);
            
            const { error: insertError } = await supabase
              .from('estoque_app')
              .insert({
                user_id: notaImagem.usuario_id,
                produto_nome: nomeExato,
                categoria: categoriaFinal,
                quantidade: quantidadeExata,
                unidade_medida: unidadeExata,
                preco_unitario_ultimo: precoUnitarioExato,
                origem: 'nota_fiscal'
              });

            if (insertError) {
              console.error(`❌ ERRO ao criar produto - Item ${index + 1}:`, insertError);
              itensComErro++;
              continue;
            }

            console.log(`✅ SUCESSO - Item ${index + 1} CRIADO:`);
            console.log(`   - Produto: ${nomeExato}`);
            console.log(`   - Quantidade: ${quantidadeExata} ${unidadeExata}`);
            console.log(`   - Preço: R$ ${precoUnitarioExato}`);
            console.log(`   - Categoria: ${categoriaFinal}`);
            itensProcessados++;
            itensCriados++;
          }

          // ⏭️ Nota já processada - pulando atualização de precos_atuais para otimizar velocidade
          console.log('⏭️ Nota já processada - pulando atualização de precos_atuais para otimizar velocidade');

        } catch (error) {
          console.error(`❌ Erro ao processar item ${index + 1}:`, error);
          itensComErro++;
        }
      }

      // 🏁 RESUMO FINAL
      console.log(`🏁 PROCESSAMENTO FINALIZADO:`);
      console.log(`   📊 Total de itens na nota: ${listaItens.length}`);
      console.log(`   ✅ Itens processados com sucesso: ${itensProcessados}`);
      console.log(`   🔄 Itens atualizados: ${itensAtualizados}`);
      console.log(`   🆕 Itens criados: ${itensCriados}`);
      console.log(`   ❌ Itens com erro: ${itensComErro}`);
      console.log(`   📈 Taxa de sucesso: ${((itensProcessados / listaItens.length) * 100).toFixed(1)}%`);
    }

    // ✅ Marcar nota como processada
    if (!notaImagem.processada) {
                'hortifruti': 'hortifruti',
                'carnes': 'açougue',
                'açougue': 'açougue',
                'padaria': 'padaria',
                'laticínios': 'laticínios/frios',
                'laticínios/frios': 'laticínios/frios',
                'frios': 'laticínios/frios',
                'higiene': 'higiene/farmácia',
                'farmácia': 'higiene/farmácia',
                'higiene/farmácia': 'higiene/farmácia',
                'congelados': 'congelados',
                'pet': 'pet',
                'mercearia': 'mercearia',
                'outros': 'outros'
              };
              
              return mapeamento[categoria] || 'outros';
            };
            
            // Usar categoria mapeada tanto da categoria do produto quanto da IA-2
            const categoriaOriginal = categoriaProduto || dadosNormalizados?.categoria || 'outros';
            const categoriaMapeada = mapearCategoria(categoriaOriginal);
            
            console.log(`🎯 Categoria mapeada: "${categoriaOriginal}" → "${categoriaMapeada}"`);
              
            // 🎯 CRÍTICO: Usar EXATAMENTE os dados da IA-2 sem modificações
            // A IA-2 já entrega os nomes no formato final correto
            const produtoNomeFinal = dadosNormalizados?.produto_nome_normalizado || nomeNormalizado;
            const categoriaFinal = dadosNormalizados?.categoria ? mapearCategoria(dadosNormalizados.categoria) : categoriaMapeada;
            const unidadeFinal = dadosNormalizados?.qtd_unidade || unidadeProduto || 'unidade';

            console.log(`🔍 DADOS FINAIS PARA INSERÇÃO (EXATOS DA IA-2):`);
            console.log(`   - Nome da IA-2: "${produtoNomeFinal}"`);
            console.log(`   - Quantidade FINAL da IA-2: ${quantidadeFinalIA2}`);
            console.log(`   - Preço Unitário FINAL da IA-2: R$ ${precoUnitarioFinalIA2}`);
            console.log(`   - Categoria da IA-2: ${categoriaFinal}`);
            console.log(`   - Unidade da IA-2: ${unidadeFinal}`);

            // Preparar dados para inserção (com valores EXATOS da IA-2)
            const dadosParaInserir = {
              user_id: notaImagem.usuario_id,
              produto_nome: produtoNomeFinal,
              categoria: categoriaFinal,
              unidade_medida: unidadeFinal,
              quantidade: quantidadeFinalIA2, // Valor EXATO da IA-2
              preco_unitario_ultimo: precoUnitarioFinalIA2, // Valor EXATO da IA-2
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
              console.error(`❌ Dados que tentou inserir:`, JSON.stringify(dadosParaInserir, null, 2));
              itensComErro++;
              continue;
            }

            console.log(`✅ SUCESSO - Item ${index + 1} CRIADO:`);
            console.log(`   - Produto: ${produtoNomeFinal}`);
            console.log(`   - Quantidade: ${quantidadeFinalIA2} ${unidadeFinal} (EXATO DA IA-2)`);
            console.log(`   - Preço: R$ ${precoUnitarioFinalIA2} (EXATO DA IA-2)`);
            itensProcessados++;
            itensCriados++;
          }

        // 🚀 OTIMIZAÇÃO: Atualizar precos_atuais apenas se necessário
        try {
          const dados = extractedData || {};
          const cnpjNota = dados?.supermercado?.cnpj || dados?.cnpj || dados?.estabelecimento?.cnpj || dados?.emitente?.cnpj;
          const estabelecimentoNomeOriginal = dados?.supermercado?.nome || dados?.estabelecimento?.nome || dados?.emitente?.nome || 'DESCONHECIDO';
          
          if (cnpjNota && estabelecimentoNomeOriginal && precoUnitario > 0) {
            // 🏪 Normalizar nome do estabelecimento
            const { data: nomeNormalizado } = await supabase.rpc('normalizar_nome_estabelecimento', {
              nome_input: estabelecimentoNomeOriginal
            });
            const estabelecimentoNome = nomeNormalizado || estabelecimentoNomeOriginal.toUpperCase();
            const cnpjLimpo = String(cnpjNota).replace(/[^\d]/g, '');

            const produtoNomePreco = dadosNormalizados?.produto_nome_normalizado || nomeNormalizado;
            console.log(`💾 Atualizando precos_atuais: ${produtoNomePreco} @ ${estabelecimentoNome} = R$ ${precoUnitario}`);

            const dadosPreco = {
              produto_nome: produtoNomePreco,
              estabelecimento_cnpj: cnpjLimpo,
              estabelecimento_nome: estabelecimentoNome,
              valor_unitario: Number(precoUnitario),
              data_atualizacao: new Date().toISOString(),
            };

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

            await supabase
              .from('precos_atuais')
              .upsert(dadosPreco, { onConflict: 'produto_nome,estabelecimento_cnpj' });
          }
        } catch (e) {
          console.error('⚠️ Erro ao atualizar precos_atuais (não crítico):', e);
        }
      } // Fechamento do for loop

      // Verificar se há itens para processar
      if (listaItens.length > 0) {
        console.log(`🏁 PROCESSAMENTO FINALIZADO:`);
        console.log(`   📊 Total de itens na nota: ${listaItens.length}`);
        console.log(`   ✅ Itens inseridos com sucesso: ${itensProcessados}`);
        console.log(`   ❌ Itens com erro: ${itensComErro}`);
        console.log(`   📈 Taxa de sucesso: ${((itensProcessados / listaItens.length) * 100).toFixed(1)}%`);
        
        // 🚨 VALIDAÇÃO: Se nenhum item foi inserido, há problema
        if (itensProcessados === 0) {
          console.error(`🚨 ERRO CRÍTICO: Nenhum item foi inserido no estoque!`);
          throw new Error(`Falha crítica: 0 de ${listaItens.length} itens foram inseridos no estoque.`);
        }
      } else {
        console.log(`⚠️ AVISO: Nenhum item encontrado na nota fiscal!`);
        throw new Error('Nota não contém produtos válidos para processar');
      }

    // ✅ Marcar nota como processada
    const { error: updateError } = await supabase
        .from('notas_imagens')
        .update({
          processada: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', imagemId);

      if (updateError) {
        console.error('❌ Erro ao atualizar nota:', updateError);
      } else {
        console.log('✅ Nota marcada como processada com sucesso');
      }
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
    
    // Verificar se é erro da IA-2 indisponível
    if (error.message && error.message.includes('IA-2 indisponível')) {
      return new Response(JSON.stringify({ 
        error: 'IA-2 INDISPONÍVEL',
        message: 'A IA está temporariamente indisponível. Por favor, aguarde alguns minutos e tente novamente.',
        user_message: 'Aguardando disponibilidade da IA para processar a nota fiscal.',
        can_retry: true
      }), {
        status: 503, // Service Unavailable
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  }
});