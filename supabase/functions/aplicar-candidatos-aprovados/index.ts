import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Iniciando sincronização manual de candidatos aprovados');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. BUSCAR TODOS OS CANDIDATOS AUTO-APROVADOS QUE AINDA NÃO FORAM APLICADOS
    const { data: candidatosAprovados, error: candidatosError } = await supabase
      .from('produtos_candidatos_normalizacao')
      .select('id, sugestao_produto_master, sugestao_sku_global, nome_padrao_sugerido')
      .eq('status', 'auto_aprovado')
      .not('sugestao_produto_master', 'is', null);

    if (candidatosError) {
      throw new Error(`Erro ao buscar candidatos: ${candidatosError.message}`);
    }

    console.log(`📊 Encontrados ${candidatosAprovados?.length || 0} candidatos aprovados`);

    if (!candidatosAprovados || candidatosAprovados.length === 0) {
      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: 'Nenhum candidato aprovado para sincronizar',
          total_candidatos: 0,
          sincronizados: 0,
          erros: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. PARA CADA CANDIDATO, SINCRONIZAR COM ESTOQUE
    let totalSincronizados = 0;
    let totalErros = 0;
    const errosDetalhados: string[] = [];

    for (const candidato of candidatosAprovados) {
      try {
        // Buscar detalhes do produto master
        const { data: master, error: masterError } = await supabase
          .from('produtos_master_global')
          .select('id, sku_global, nome_padrao, nome_base, marca, categoria, imagem_url')
          .eq('id', candidato.sugestao_produto_master)
          .single();

        if (masterError || !master) {
          console.warn(`⚠️ Master não encontrado para candidato ${candidato.id}`);
          totalErros++;
          errosDetalhados.push(`Candidato ${candidato.id}: Master ${candidato.sugestao_produto_master} não encontrado`);
          continue;
        }

        // Atualizar estoque usando FK direta (produto_candidato_id)
        const { error: estoqueError, count } = await supabase
          .from('estoque_app')
          .update({
            produto_master_id: master.id,
            sku_global: master.sku_global,
            produto_nome: master.nome_padrao,
            produto_nome_normalizado: master.nome_padrao,
            nome_base: master.nome_base,
            marca: master.marca,
            categoria: (master.categoria || 'outros').toLowerCase(),
            imagem_url: master.imagem_url || undefined,
            updated_at: new Date().toISOString()
          })
          .eq('produto_candidato_id', candidato.id) // ✅ FK garantida
          .is('produto_master_id', null); // Só atualizar quem ainda não tem master

        if (estoqueError) {
          console.error(`❌ Erro ao atualizar estoque para candidato ${candidato.id}: ${estoqueError.message}`);
          totalErros++;
          errosDetalhados.push(`Candidato ${candidato.id}: ${estoqueError.message}`);
        } else if (count && count > 0) {
          console.log(`✅ Sincronizado: ${master.nome_padrao} (${count} itens)`);
          totalSincronizados++;
        } else {
          console.log(`ℹ️ Candidato ${candidato.id} já estava sincronizado ou sem itens no estoque`);
        }

      } catch (erro: any) {
        console.error(`❌ Erro ao processar candidato ${candidato.id}:`, erro);
        totalErros++;
        errosDetalhados.push(`Candidato ${candidato.id}: ${erro.message}`);
      }
    }

    console.log(`\n📊 RESUMO DA SINCRONIZAÇÃO:`);
    console.log(`   ✅ Sincronizados: ${totalSincronizados}`);
    console.log(`   ❌ Erros: ${totalErros}`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: `Sincronização concluída: ${totalSincronizados} candidatos aplicados`,
        total_candidatos: candidatosAprovados.length,
        sincronizados: totalSincronizados,
        erros: totalErros,
        erros_detalhados: errosDetalhados.length > 0 ? errosDetalhados : undefined,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error);
    return new Response(
      JSON.stringify({
        sucesso: false,
        erro: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
