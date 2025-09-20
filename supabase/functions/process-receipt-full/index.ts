import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    const { imagemId, notaImagemId } = await req.json();
    const finalImagemId = imagemId || notaImagemId;

    if (!finalImagemId) {
      return new Response(
        JSON.stringify({ error: 'ID da imagem é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🏗️ [${new Date().toISOString()}] NOVA INSERÇÃO SIMPLES - ID: ${finalImagemId} - EXECUÇÃO INICIADA`);
    
    // ✅ PROTEÇÃO CONTRA EXECUÇÃO DUPLICADA + LOCK IMEDIATO
    // Marcar a nota como processada IMEDIATAMENTE para evitar execuções simultâneas
    const { data: lockResult, error: lockError } = await supabase
      .from('notas_imagens')
      .update({ processada: true, updated_at: new Date().toISOString() })
      .eq('id', finalImagemId)
      .eq('processada', false) // Só atualizar se ainda estiver false
      .select('id');
    
    if (lockError || !lockResult || lockResult.length === 0) {
      console.log(`⚠️ [${new Date().toISOString()}] NOTA JÁ PROCESSADA OU ERRO NO LOCK - ID: ${finalImagemId} - ABORTANDO`);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Nota já foi processada ou erro no lock',
          nota_id: finalImagemId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`🔒 [${new Date().toISOString()}] LOCK OBTIDO - PROCESSANDO NOTA: ${finalImagemId}`);

    // Buscar a nota com dados extraídos
    const { data: notaImagem, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', finalImagemId)
      .single();

    if (notaError || !notaImagem) {
      throw new Error(`Nota não encontrada: ${notaError?.message}`);
    }

    if (!notaImagem.dados_extraidos) {
      throw new Error('Nota não foi processada pela IA de extração');
    }

    // ⚠️ HOTFIX: Removido bloqueio por processada
    // A IA-1 é responsável pela duplicidade (44 dígitos)

    console.log(`📋 Nota encontrada - Usuário: ${notaImagem.usuario_id}`);
    console.log(`📦 Dados extraídos:`, JSON.stringify(notaImagem.dados_extraidos, null, 2));

    // ✅ INSERÇÃO SIMPLES - ESPELHO DIRETO DO CUPONZINHO
    const itens = notaImagem.dados_extraidos.itens || [];
    
    if (itens.length === 0) {
      throw new Error('Nenhum item encontrado na nota');
    }

    console.log(`📋 Processando ${itens.length} itens para consolidação e inserção...`);

    let sucessos = 0;
    const resultados = [];
    
    // ✅ CONSOLIDAÇÃO: Agrupar itens iguais (mesma descrição + preço unitário)
    const itensConsolidados = new Map();
    
    for (const item of itens) {
      try {
        // ✅ CORREÇÃO: Conversão com vírgulas brasileiras
        const descricaoOriginal = String(item.descricao || '').trim();
        const descricao = descricaoOriginal || 'DESCRIÇÃO INVÁLIDA';
        
        const quantidadeStr = String(item.quantidade || "0").replace(",", ".");
        const quantidade = parseFloat(quantidadeStr) || 0;
        
        const valorUnitarioStr = String(item.valor_unitario || "0").replace(",", ".");
        const valorUnitario = parseFloat(valorUnitarioStr) || 0;
        
        const unidade = String(item.unidade || 'UN').trim();
        const categoria = String(item.categoria || 'OUTROS');
        
        // Normalizar unidade
        const unidadeNormalizada = unidade === 'Unidade' ? 'UN' : unidade.toUpperCase();
        
        // Chave única para consolidação: descrição + preço unitário + unidade
        const chaveConsolidacao = `${descricao}|${valorUnitario}|${unidadeNormalizada}`;
        
        if (itensConsolidados.has(chaveConsolidacao)) {
          // Somar quantidade ao item existente
          const itemExistente = itensConsolidados.get(chaveConsolidacao);
          itemExistente.quantidade += quantidade;
          console.log(`🔄 Consolidando: ${descricao} - Nova qtd: ${itemExistente.quantidade}`);
        } else {
          // Criar novo item consolidado
          itensConsolidados.set(chaveConsolidacao, {
            produto_nome: descricao,
            categoria: categoria,
            quantidade: quantidade,
            unidade_medida: unidadeNormalizada,
            preco_unitario_ultimo: valorUnitario,
            user_id: notaImagem.usuario_id,
            origem: 'nota_fiscal'
          });
          console.log(`➕ Novo item: ${descricao} - Qtd: ${quantidade}`);
        }

      } catch (error) {
        console.error(`❌ Erro no processamento do item:`, error);
        console.error(`❌ Item que causou erro:`, JSON.stringify(item, null, 2));
        resultados.push({
          produto: item.descricao || 'Item com erro',
          status: 'erro',
          erro: error.message
        });
      }
    }

    console.log(`📦 Itens consolidados: ${itensConsolidados.size} (de ${itens.length} originais)`);

    // INSERÇÃO DOS ITENS CONSOLIDADOS
    for (const [chave, produto] of itensConsolidados) {
      try {
        console.log('INSERT_CONSOLIDADO', {
          produto: produto.produto_nome,
          quantidade: produto.quantidade,
          unidade: produto.unidade_medida,
          preco: produto.preco_unitario_ultimo
        });

        const { data: insertData, error: insertError } = await supabase
          .from('estoque_app')
          .insert(produto)
          .select();

        if (insertError) {
          console.error('INSERT_ERR', insertError);
          resultados.push({
            produto: produto.produto_nome,
            status: 'erro',
            erro: insertError.message
          });
          continue;
        }

        console.log('INSERT_OK', insertData[0]?.id);
        sucessos++;
        resultados.push({
          produto: produto.produto_nome,
          quantidade: produto.quantidade,
          preco: produto.preco_unitario_ultimo,
          status: 'sucesso'
        });

      } catch (error) {
        console.error(`❌ Erro na inserção consolidada:`, error);
        resultados.push({
          produto: produto.produto_nome,
          status: 'erro',
          erro: error.message
        });
      }
    }

    // Nota já foi marcada como processada no início (lock)

    console.log(`🎯 [${new Date().toISOString()}] INSERÇÃO CONCLUÍDA: ${sucessos}/${itens.length} produtos inseridos - ID: ${finalImagemId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${sucessos} produtos inseridos no estoque`,
        itens_processados: itens.length,
        itens_inseridos: sucessos,
        resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na inserção:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});