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

    // 🔍 VALIDAÇÃO DE NOTA FISCAL (antes de qualquer processamento)
    const analisarSeENotaFiscal = (dados: any) => {
      // Critério 1: Chave de acesso com 44 dígitos
      const chaveAcesso = dados?.chave_acesso || 
                         dados?.compra?.chave_acesso ||
                         dados?.nota?.chave_acesso ||
                         dados?.access_key;
      const chaveValida = chaveAcesso && chaveAcesso.replace(/[^\d]/g, '').length === 44;
      
      // Critério 2: CNPJ do estabelecimento
      const cnpj = dados?.estabelecimento?.cnpj || 
                   dados?.store_cnpj ||
                   dados?.cnpj;
      const cnpjValido = cnpj && cnpj.replace(/[^\d]/g, '').length >= 14;
      
      // Critério 3: Data da compra
      const dataCompra = dados?.compra?.data_emissao || 
                        dados?.purchase_date ||
                        dados?.data_compra;
      const dataValida = dataCompra && dataCompra.length > 0;
      
      // Critério 4: Valor total
      const valorTotal = dados?.compra?.valor_total || 
                        dados?.total_amount ||
                        dados?.valor_total;
      const valorValido = valorTotal && typeof valorTotal === 'number' && valorTotal > 0;
      
      // Critério 5: Lista de itens com pelo menos 1 produto válido
      const itens = dados?.itens || dados?.items || dados?.produtos || [];
      const itemValido = itens.length > 0 && itens.some(item => 
        (item.descricao || item.name || item.nome) && 
        (item.quantidade || item.quantity) && 
        (item.valor_unitario || item.unit_price || item.precoUnitario || item.valor_total || item.total_price || item.precoTotal)
      );
      
      console.log("🔍 ANÁLISE DE NOTA FISCAL:");
      console.log(`   - Chave de acesso (44 dígitos): ${chaveValida ? '✅' : '❌'} (${chaveAcesso || 'não encontrada'})`);
      console.log(`   - CNPJ estabelecimento: ${cnpjValido ? '✅' : '❌'} (${cnpj || 'não encontrado'})`);
      console.log(`   - Data da compra: ${dataValida ? '✅' : '❌'} (${dataCompra || 'não encontrada'})`);
      console.log(`   - Valor total: ${valorValido ? '✅' : '❌'} (${valorTotal || 'não encontrado'})`);
      console.log(`   - Itens válidos: ${itemValido ? '✅' : '❌'} (${itens.length} itens encontrados)`);
      
      const isNotaFiscal = chaveValida && cnpjValido && dataValida && valorValido && itemValido;
      
      if (!isNotaFiscal) {
        let motivos = [];
        if (!chaveValida) motivos.push('chave de acesso inválida');
        if (!cnpjValido) motivos.push('CNPJ inválido');
        if (!dataValida) motivos.push('data inválida');
        if (!valorValido) motivos.push('valor total inválido');
        if (!itemValido) motivos.push('itens inválidos');
        
        return {
          isNotaFiscal: false,
          reason: `Não atende aos critérios de nota fiscal: ${motivos.join(', ')}`
        };
      }
      
      return {
        isNotaFiscal: true,
        reason: 'Documento atende aos critérios de nota fiscal válida'
      };
    };

    // Analisar se é nota fiscal
    const analise = analisarSeENotaFiscal(extractedData);
    console.log(`🤖 DECISÃO DA IA: ${analise.isNotaFiscal ? 'É NOTA FISCAL' : 'NÃO É NOTA FISCAL'}`);
    console.log(`📝 Motivo: ${analise.reason}`);

    if (!analise.isNotaFiscal) {
      console.log("❌ ARQUIVO NÃO É UMA NOTA FISCAL VÁLIDA - Cancelando processamento");
      
      // Excluir arquivo do storage
      try {
        const { error: deleteError } = await supabase.storage
          .from('receipts')
          .remove([notaImagem.imagem_path]);
        
        if (deleteError) {
          console.error("⚠️ Erro ao excluir arquivo do storage:", deleteError);
        } else {
          console.log("🗑️ Arquivo excluído do storage");
        }
      } catch (deleteStorageError) {
        console.error("⚠️ Erro ao excluir do storage:", deleteStorageError);
      }

      // Excluir registro do banco
      try {
        const { error: deleteDbError } = await supabase
          .from('notas_imagens')
          .delete()
          .eq('id', imagemId);
        
        if (deleteDbError) {
          console.error("⚠️ Erro ao excluir registro do banco:", deleteDbError);
        } else {
          console.log("🗑️ Registro excluído do banco");
        }
      } catch (deleteDbError) {
        console.error("⚠️ Erro ao excluir do banco:", deleteDbError);
      }

      return new Response(
        JSON.stringify({
          success: false,
          isNotaFiscal: false,
          reason: analise.reason,
          message: "❌ Esse arquivo não é uma nota fiscal válida. O Picotinho não aceita esse tipo de documento. Por favor, envie apenas nota ou cupom fiscal em PDF, XML ou imagem."
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("✅ NOTA FISCAL VALIDADA - Prosseguindo com o processamento");

    // 🧠 Função avançada para normalizar nomes de produtos usando tabela dinâmica
    const normalizarNomeProduto = async (nome: string): Promise<string> => {
      if (!nome) return '';
      
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
      
      return nomeNormalizado;
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
    if (extractedData.produtos && Array.isArray(extractedData.produtos)) {
      console.log('📦 Atualizando estoque automaticamente...');
      
      for (let index = 0; index < extractedData.produtos.length; index++) {
        const produtoData = extractedData.produtos[index];
        try {
          console.log(`\n🔍 PROCESSANDO ITEM ${index + 1}: "${produtoData.nome}"`);
          console.log(`   - Quantidade: ${produtoData.quantidade}`);
          console.log(`   - Preço unitário: ${produtoData.precoUnitario}`);
          console.log(`   - Preço total: ${produtoData.precoTotal}`);
          console.log(`   - Categoria: ${produtoData.categoria}`);
          
          const nomeNormalizado = await normalizarNomeProduto(produtoData.nome);
          console.log(`🏷️ Original: "${produtoData.nome}" -> Normalizado: "${nomeNormalizado}"`);

          if (!produtoData.nome || !produtoData.quantidade) {
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
            
            // Primeiro: tentar match exato com o nome normalizado
            for (const prod of estoqueLista) {
              const produtoNomeNormalizado = await normalizarNomeProduto(prod.produto_nome);
              if (produtoNomeNormalizado === nomeNormalizado) {
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
            const novaQuantidade = produtoSimilar.quantidade + (produtoData.quantidade || 1);
            
            // CORREÇÃO CRÍTICA: SEMPRE usar o preço da nota fiscal se existir
            const precoAtualizado = produtoData.precoUnitario || produtoSimilar.preco_unitario_ultimo || 0;
            
            console.log(`🔍 COMPARAÇÃO DETALHADA - ITEM ${index + 1}`);
            console.log(`   ✅ PRODUTO ENCONTRADO NO ESTOQUE:`);
            console.log(`      - ID do produto: ${produtoSimilar.id}`);
            console.log(`      - Nome no estoque: "${produtoSimilar.produto_nome}"`);
            console.log(`      - Nome normalizado: "${nomeNormalizado}"`);
            console.log(`   💰 PREÇOS:`);
            console.log(`      - Preço da nota fiscal: ${produtoData.precoUnitario}`);
            console.log(`      - Preço atual no estoque: ${produtoSimilar.preco_unitario_ultimo}`);
            console.log(`      - Preço que será salvo: ${precoAtualizado}`);
            console.log(`   📦 QUANTIDADES:`);
            console.log(`      - Quantidade anterior: ${produtoSimilar.quantidade}`);
            console.log(`      - Quantidade a adicionar: ${produtoData.quantidade}`);
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
            console.log(`   - Quantidade: ${novaQuantidade} ${produtoData.unidade || 'unidade'}`);
            console.log(`   - Preço: R$ ${precoAtualizado}`);
            
          } else {
            console.log(`🆕 CRIANDO NOVO ITEM ${index + 1} - "${nomeNormalizado}"`);
            console.log(`   - Preço unitário: ${produtoData.precoUnitario}`);
            console.log(`   - Quantidade: ${produtoData.quantidade}`);
            console.log(`   - Categoria: ${produtoData.categoria}`);
            
            // 📈 Criar novo produto no estoque
            const { error: insertError } = await supabase
              .from('estoque_app')
              .insert({
                user_id: notaImagem.usuario_id,
                produto_nome: nomeNormalizado,
                categoria: produtoData.categoria || 'outros',
                unidade_medida: produtoData.unidade || 'unidade',
                quantidade: produtoData.quantidade || 1,
                preco_unitario_ultimo: produtoData.precoUnitario || 0
              });

            if (insertError) {
              console.error(`❌ ERRO ao criar produto - Item ${index + 1}:`, insertError);
              continue;
            }

            console.log(`✅ SUCESSO - Item ${index + 1} CRIADO:`);
            console.log(`   - Produto: ${nomeNormalizado}`);
            console.log(`   - Quantidade: ${produtoData.quantidade} ${produtoData.unidade || 'unidade'}`);
            console.log(`   - Preço: R$ ${produtoData.precoUnitario || 0}`);
          }
        } catch (error) {
          console.error(`❌ Erro ao processar item ${index + 1} (${produtoData.nome}):`, error);
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

    return new Response(
      JSON.stringify({ 
        success: true,
        isNotaFiscal: true,
        reason: analise.reason,
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