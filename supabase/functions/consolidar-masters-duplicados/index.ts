import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MasterDuplicado {
  nome_base: string;
  marca: string | null;
  masters: {
    id: string;
    sku_global: string;
    created_at: string;
    total_notas: number;
  }[];
}

interface RelatorioGrupo {
  nome_base: string;
  marca: string | null;
  master_principal_sku: string;
  duplicados_removidos: number;
  sinonimos_criados: number;
  referencias_atualizadas_estoque: number;
  referencias_atualizadas_candidatos: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    console.log('🔍 Buscando masters duplicados...');

    // 1. Buscar todos os masters ativos
    const { data: allMasters, error: mastersError } = await supabase
      .from('produtos_master_global')
      .select('id, sku_global, nome_base, marca, created_at, total_notas, status')
      .eq('status', 'ativo')
      .order('created_at', { ascending: true });

    if (mastersError) throw mastersError;

    console.log(`📊 Total de masters ativos: ${allMasters?.length || 0}`);

    // 2. Agrupar por (nome_base + marca)
    const grupos = new Map<string, MasterDuplicado>();
    
    for (const master of allMasters || []) {
      const chave = `${master.nome_base}|||${master.marca || 'SEM_MARCA'}`;
      
      if (!grupos.has(chave)) {
        grupos.set(chave, {
          nome_base: master.nome_base,
          marca: master.marca,
          masters: []
        });
      }
      
      grupos.get(chave)!.masters.push({
        id: master.id,
        sku_global: master.sku_global,
        created_at: master.created_at,
        total_notas: master.total_notas || 0
      });
    }

    // 3. Filtrar apenas grupos com duplicatas (2 ou mais masters)
    const gruposComDuplicatas = Array.from(grupos.values())
      .filter(g => g.masters.length > 1);

    console.log(`🎯 Grupos com duplicatas encontrados: ${gruposComDuplicatas.length}`);

    if (gruposComDuplicatas.length === 0) {
      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: 'Nenhuma duplicata encontrada! Base de dados já está consolidada.',
          total_grupos_consolidados: 0,
          total_masters_removidos: 0,
          total_sinonimos_criados: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Processar cada grupo de duplicatas
    const relatorio: RelatorioGrupo[] = [];
    let totalMastersRemovidos = 0;
    let totalSinonimos = 0;

    for (const grupo of gruposComDuplicatas) {
      console.log(`\n🔄 Processando grupo: ${grupo.nome_base} (${grupo.marca || 'sem marca'})`);
      console.log(`   Masters no grupo: ${grupo.masters.length}`);

      // Ordenar por: mais notas primeiro, depois mais antigo
      grupo.masters.sort((a, b) => {
        if (b.total_notas !== a.total_notas) {
          return b.total_notas - a.total_notas;
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const masterPrincipal = grupo.masters[0];
      const duplicados = grupo.masters.slice(1);

      console.log(`   ✅ Master principal: ${masterPrincipal.sku_global} (${masterPrincipal.total_notas} notas)`);
      console.log(`   ❌ Duplicados: ${duplicados.length}`);

      let sinonimosCriados = 0;
      let refEstoqueAtualizadas = 0;
      let refCandidatosAtualizadas = 0;

      // Para cada duplicado
      for (const duplicado of duplicados) {
        // 4.1 Criar sinônimo do SKU duplicado apontando para o principal (SE NÃO EXISTIR)
        const { data: sinonimoExistente } = await supabase
          .from('produtos_sinonimos_globais')
          .select('id')
          .eq('produto_master_id', masterPrincipal.id)
          .eq('texto_variacao', duplicado.sku_global)
          .maybeSingle();

        if (!sinonimoExistente) {
          const { error: sinonimoError } = await supabase
            .from('produtos_sinonimos_globais')
            .insert({
              produto_master_id: masterPrincipal.id,
              texto_variacao: duplicado.sku_global,
              fonte: 'consolidacao_automatica',
              confianca: 100,
              total_ocorrencias: duplicado.total_notas,
              aprovado_por: null, // Sistema
              aprovado_em: new Date().toISOString()
            });

          if (!sinonimoError) {
            sinonimosCriados++;
            console.log(`      ➕ Sinônimo criado: ${duplicado.sku_global} -> ${masterPrincipal.sku_global}`);
          } else {
            console.error(`      ⚠️ Erro ao criar sinônimo: ${sinonimoError.message}`);
          }
        } else {
          console.log(`      ⏭️ Sinônimo já existe: ${duplicado.sku_global} -> ${masterPrincipal.sku_global}`);
        }

        // 4.2 Atualizar referências em estoque_app
        const { count: estoqueCount, error: estoqueError } = await supabase
          .from('estoque_app')
          .update({ produto_hash_normalizado: masterPrincipal.sku_global })
          .eq('produto_hash_normalizado', duplicado.sku_global)
          .select('*', { count: 'exact', head: true });

        if (!estoqueError && estoqueCount) {
          refEstoqueAtualizadas += estoqueCount;
          console.log(`      🔄 Estoque atualizado: ${estoqueCount} registros`);
        }

        // 4.3 Atualizar referências em produtos_candidatos_normalizacao
        const { count: candidatosCount, error: candidatosError } = await supabase
          .from('produtos_candidatos_normalizacao')
          .update({ sugestao_produto_master: masterPrincipal.id })
          .eq('sugestao_produto_master', duplicado.id)
          .select('*', { count: 'exact', head: true });

        if (!candidatosError && candidatosCount) {
          refCandidatosAtualizadas += candidatosCount;
          console.log(`      🔄 Candidatos atualizados: ${candidatosCount} registros`);
        }

        // 4.4 Marcar duplicado como consolidado (soft delete)
        await supabase
          .from('produtos_master_global')
          .update({ 
            status: 'consolidado',
            updated_at: new Date().toISOString()
          })
          .eq('id', duplicado.id);

        console.log(`      ✔️ Master ${duplicado.sku_global} marcado como consolidado`);
      }

      // Adicionar ao relatório
      relatorio.push({
        nome_base: grupo.nome_base,
        marca: grupo.marca,
        master_principal_sku: masterPrincipal.sku_global,
        duplicados_removidos: duplicados.length,
        sinonimos_criados: sinonimosCriados,
        referencias_atualizadas_estoque: refEstoqueAtualizadas,
        referencias_atualizadas_candidatos: refCandidatosAtualizadas
      });

      totalMastersRemovidos += duplicados.length;
      totalSinonimos += sinonimosCriados;
    }

    console.log('\n✅ Consolidação concluída!');
    console.log(`   Grupos consolidados: ${gruposComDuplicatas.length}`);
    console.log(`   Masters removidos: ${totalMastersRemovidos}`);
    console.log(`   Sinônimos criados: ${totalSinonimos}`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        total_grupos_consolidados: gruposComDuplicatas.length,
        total_masters_removidos: totalMastersRemovidos,
        total_sinonimos_criados: totalSinonimos,
        grupos: relatorio,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na consolidação:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        sucesso: false
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
