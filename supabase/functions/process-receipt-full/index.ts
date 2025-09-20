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

    console.log(`🏗️ NOVA INSERÇÃO SIMPLES - ID: ${finalImagemId}`);

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

    if (notaImagem.processada) {
      console.log('⚠️ Nota já processada - evitando duplicação');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Nota já foi processada anteriormente',
          itens_inseridos: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Nota encontrada - Usuário: ${notaImagem.usuario_id}`);
    console.log(`📦 Dados extraídos:`, JSON.stringify(notaImagem.dados_extraidos, null, 2));

    // ✅ INSERÇÃO SIMPLES - ESPELHO DIRETO DO CUPONZINHO
    const itens = notaImagem.dados_extraidos.itens || [];
    
    if (itens.length === 0) {
      throw new Error('Nenhum item encontrado na nota');
    }

    console.log(`📋 Processando ${itens.length} itens para inserção direta...`);

    let sucessos = 0;
    const resultados = [];

    // Processar cada item EXATAMENTE como está no cuponzinho
    for (const item of itens) {
      try {
        const produto = {
          user_id: notaImagem.usuario_id,
          produto_nome: String(item.descricao || item.nome || '').trim(),
          categoria: String(item.categoria || 'OUTROS').toUpperCase(),
          quantidade: Number(item.quantidade || 0),
          unidade_medida: String(item.unidade || 'UN').toUpperCase(),
          preco_unitario_ultimo: Number(item.valor_unitario || 0),
          origem: 'nota_fiscal'
        };

        // Validações mínimas
        if (!produto.produto_nome || produto.quantidade <= 0) {
          console.log(`⚠️ Item inválido: ${produto.produto_nome} - Qtd: ${produto.quantidade}`);
          continue;
        }

        console.log(`📦 Inserindo: ${produto.produto_nome} | ${produto.quantidade} ${produto.unidade_medida} | R$ ${produto.preco_unitario_ultimo}`);

        // INSERÇÃO DIRETA SEM VERIFICAÇÕES
        const { data: insertData, error: insertError } = await supabase
          .from('estoque_app')
          .insert(produto)
          .select();

        if (insertError) {
          console.error(`❌ Erro ao inserir ${produto.produto_nome}:`, insertError);
          resultados.push({
            produto: produto.produto_nome,
            status: 'erro',
            erro: insertError.message
          });
          continue;
        }

        console.log(`✅ Inserido: ${produto.produto_nome} - ID: ${insertData[0]?.id}`);
        sucessos++;
        resultados.push({
          produto: produto.produto_nome,
          quantidade: produto.quantidade,
          preco: produto.preco_unitario_ultimo,
          status: 'sucesso'
        });

      } catch (error) {
        console.error(`❌ Erro no item:`, error);
        resultados.push({
          produto: item.descricao || item.nome || 'Item desconhecido',
          status: 'erro',
          erro: error.message
        });
      }
    }

    // Marcar nota como processada
    await supabase
      .from('notas_imagens')
      .update({ processada: true })
      .eq('id', finalImagemId);

    console.log(`🎯 INSERÇÃO CONCLUÍDA: ${sucessos}/${itens.length} produtos inseridos`);

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