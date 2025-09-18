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
            // ✅ GRAVADOR CEGO - USAR APENAS OS VALORES EXATOS DA IA-2
            // SEMPRE substituir com valor exato da nota - sem somar nem interpretar
            const novaQuantidade = quantidadeExata;
            console.log(`🔄 GRAVANDO valor exato da IA-2: ${quantidadeExata} (substituindo ${produtoExistente.quantidade})`)
            
            console.log(`🔄 ATUALIZANDO produto existente: "${produtoExistente.produto_nome}"`);
            console.log(`   - Quantidade: ${produtoExistente.quantidade} → ${novaQuantidade}`);
            console.log(`   - Preço: ${produtoExistente.preco_unitario_ultimo} → ${precoUnitarioExato}`);
            
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

          // ✅ Item processado com sucesso

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
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});