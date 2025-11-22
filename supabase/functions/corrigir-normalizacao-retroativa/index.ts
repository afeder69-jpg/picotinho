import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔧 Iniciando correção retroativa de produtos normalizados...');

    // 1. Buscar produtos no estoque com candidato mas sem master
    const { data: produtosInconsistentes, error: estoqueError } = await supabase
      .from('estoque_app')
      .select('id, produto_nome, produto_candidato_id, nota_id, user_id')
      .not('produto_candidato_id', 'is', null)
      .is('produto_master_id', null);

    if (estoqueError) {
      throw new Error(`Erro ao buscar produtos inconsistentes: ${estoqueError.message}`);
    }

    if (!produtosInconsistentes || produtosInconsistentes.length === 0) {
      console.log('✅ Nenhum produto inconsistente encontrado!');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Nenhum produto inconsistente encontrado',
          produtosCorrigidos: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Encontrados ${produtosInconsistentes.length} produtos inconsistentes`);

    let produtosCorrigidos = 0;
    let erros: any[] = [];

    // 2. Para cada produto inconsistente
    for (const produto of produtosInconsistentes) {
      try {
        console.log(`\n🔍 Processando: ${produto.produto_nome}`);

        // Buscar o candidato associado
        const { data: candidato, error: candidatoError } = await supabase
          .from('produtos_candidatos_normalizacao')
          .select('sugestao_produto_master, status')
          .eq('id', produto.produto_candidato_id)
          .single();

        if (candidatoError || !candidato) {
          console.error(`⚠️ Candidato não encontrado para produto ${produto.produto_nome}`);
          erros.push({ produto: produto.produto_nome, erro: 'Candidato não encontrado' });
          continue;
        }

        // Verificar se candidato está auto-aprovado e tem master
        if (candidato.status !== 'auto_aprovado' || !candidato.sugestao_produto_master) {
          console.log(`⏭️ Candidato não auto-aprovado ou sem master: ${produto.produto_nome}`);
          continue;
        }

        // Buscar dados completos do master
        const { data: master, error: masterError } = await supabase
          .from('produtos_master_global')
          .select('id, sku_global, nome_padrao, nome_base, marca, categoria, imagem_url')
          .eq('id', candidato.sugestao_produto_master)
          .single();

        if (masterError || !master) {
          console.error(`⚠️ Master não encontrado: ${candidato.sugestao_produto_master}`);
          erros.push({ produto: produto.produto_nome, erro: 'Master não encontrado' });
          continue;
        }

        // Atualizar o estoque com os dados completos do master
        const { error: updateError } = await supabase
          .from('estoque_app')
          .update({
            produto_master_id: master.id,
            sku_global: master.sku_global,
            produto_nome: master.nome_padrao,
            produto_nome_normalizado: master.nome_padrao,
            nome_base: master.nome_base,
            marca: master.marca,
            categoria: master.categoria?.toLowerCase() || produto.categoria,
            imagem_url: master.imagem_url,
            updated_at: new Date().toISOString()
          })
          .eq('id', produto.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar produto ${produto.produto_nome}: ${updateError.message}`);
          erros.push({ produto: produto.produto_nome, erro: updateError.message });
          continue;
        }

        produtosCorrigidos++;
        console.log(`✅ Produto corrigido: ${produto.produto_nome} → ${master.nome_padrao}`);
        if (master.imagem_url) {
          console.log(`📸 Imagem vinculada: ${master.imagem_url}`);
        }

      } catch (error: any) {
        console.error(`❌ Erro ao processar produto ${produto.produto_nome}: ${error.message}`);
        erros.push({ produto: produto.produto_nome, erro: error.message });
      }
    }

    console.log(`\n🎉 Correção retroativa concluída!`);
    console.log(`✅ Produtos corrigidos: ${produtosCorrigidos}`);
    console.log(`❌ Erros: ${erros.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        produtosCorrigidos,
        totalInconsistentes: produtosInconsistentes.length,
        erros,
        message: `Correção concluída: ${produtosCorrigidos} produtos atualizados`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro na correção retroativa:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
