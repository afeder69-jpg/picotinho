import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

interface GrupoInput {
  manter_id: string;
  remover_ids: string[];
}

interface DetalheGrupo {
  mantido: string;
  mantido_sku: string;
  removidos: string[];
  sinonimos_criados: number;
  sinonimos_migrados: number;
  sinonimos_skip_unicidade: number;
  estoque_por_master_id: number;
  estoque_por_sku_legado: number;
  candidatos_migrados: number;
  precos_migrados: number;
  atributos_herdados: string[];
  conflitos: string[];
  validacao_pre_delete: 'ok' | 'abortado';
  referencias_remanescentes?: Record<string, number>;
  log_historico_decisoes: number;
  estoque_sincronizado: number;
  erro?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { grupos } = await req.json();

    if (!grupos || !Array.isArray(grupos)) {
      throw new Error('Grupos inválidos: esperado array de { manter_id, remover_ids[] }');
    }

    console.log(`⚙️ Iniciando fusão segura de ${grupos.length} grupo(s)...`);

    let totalMastersRemovidos = 0;
    let totalSinonimosGerados = 0;
    let totalReferenciasAtualizadas = 0;
    const detalhes: DetalheGrupo[] = [];

    for (const grupo of grupos as GrupoInput[]) {
      const { manter_id, remover_ids } = grupo;

      if (!manter_id || !Array.isArray(remover_ids) || remover_ids.length === 0) {
        console.warn('⚠️ Grupo inválido, pulando:', grupo);
        continue;
      }

      // ── Passo 1: Buscar master preservado e removidos ──
      const { data: produtoMantido, error: mantidoError } = await supabase
        .from('produtos_master_global')
        .select('*')
        .eq('id', manter_id)
        .single();

      if (mantidoError || !produtoMantido) {
        console.error('❌ Produto mantido não encontrado:', manter_id);
        continue;
      }

      const { data: produtosRemover, error: removerError } = await supabase
        .from('produtos_master_global')
        .select('*')
        .in('id', remover_ids);

      if (removerError || !produtosRemover || produtosRemover.length === 0) {
        console.error('❌ Erro ao buscar produtos a remover');
        continue;
      }

      console.log(`\n🔄 Grupo: manter "${produtoMantido.nome_padrao}" (${produtoMantido.sku_global})`);
      console.log(`   Remover: ${produtosRemover.length} produto(s)`);

      let sinonimosCriados = 0;
      let sinonimosMigrados = 0;
      let sinonimosSkipUnicidade = 0;
      let estoquePorMasterId = 0;
      let estoquePorSkuLegado = 0;
      let candidatosMigrados = 0;
      let precosMigrados = 0;
      const atributosHerdados: string[] = [];
      const conflitos: string[] = [];

      // Acumular valores para enriquecimento (primeiro removido com valor ganha)
      const heranca: Record<string, any> = {};

      // ── Passo 2: Para cada master removido ──
      for (const produtoRemover of produtosRemover) {
        console.log(`\n   📦 Processando removido: "${produtoRemover.nome_padrao}" (${produtoRemover.sku_global})`);

        // 2a. Criar sinônimo do SKU removido
        const { data: sinExistente } = await supabase
          .from('produtos_sinonimos_globais')
          .select('id')
          .eq('produto_master_id', produtoMantido.id)
          .eq('texto_variacao', produtoRemover.sku_global)
          .maybeSingle();

        if (!sinExistente) {
          const { error: sinError } = await supabase
            .from('produtos_sinonimos_globais')
            .insert({
              produto_master_id: produtoMantido.id,
              texto_variacao: produtoRemover.sku_global,
              confianca: 1.0,
              total_ocorrencias: produtoRemover.total_notas || 1,
              fonte: 'consolidacao_manual',
              aprovado_em: new Date().toISOString()
            });

          if (!sinError) {
            sinonimosCriados++;
            console.log(`      ✅ Sinônimo criado: ${produtoRemover.sku_global} → ${produtoMantido.sku_global}`);
          } else {
            console.error(`      ⚠️ Erro ao criar sinônimo: ${sinError.message}`);
          }
        } else {
          sinonimosSkipUnicidade++;
          console.log(`      ⏭️ Sinônimo SKU já existe, skip`);
        }

        // 2b. Migrar sinônimos existentes do removido para o preservado
        const { data: sinonimosDoRemovido } = await supabase
          .from('produtos_sinonimos_globais')
          .select('id, texto_variacao')
          .eq('produto_master_id', produtoRemover.id);

        if (sinonimosDoRemovido && sinonimosDoRemovido.length > 0) {
          for (const sin of sinonimosDoRemovido) {
            // Checar se já existe no preservado
            const { data: jaExiste } = await supabase
              .from('produtos_sinonimos_globais')
              .select('id')
              .eq('produto_master_id', produtoMantido.id)
              .eq('texto_variacao', sin.texto_variacao)
              .maybeSingle();

            if (jaExiste) {
              sinonimosSkipUnicidade++;
              console.log(`      ⏭️ Sinônimo "${sin.texto_variacao}" já existe no preservado, skip`);
              // Deletar o do removido pois já existe no preservado
              await supabase
                .from('produtos_sinonimos_globais')
                .delete()
                .eq('id', sin.id);
            } else {
              const { error: migError } = await supabase
                .from('produtos_sinonimos_globais')
                .update({ produto_master_id: produtoMantido.id })
                .eq('id', sin.id);

              if (!migError) {
                sinonimosMigrados++;
                console.log(`      ✅ Sinônimo migrado: "${sin.texto_variacao}"`);
              } else {
                console.error(`      ⚠️ Erro ao migrar sinônimo: ${migError.message}`);
              }
            }
          }
        }

        // 2c. Migrar estoque por produto_master_id (principal)
        const { data: countEstoqueMasterData, error: estMasterErr } = await supabase
          .from('estoque_app')
          .update({
            produto_master_id: produtoMantido.id,
            sku_global: produtoMantido.sku_global
          })
          .eq('produto_master_id', produtoRemover.id)
          .select('id');
        const countEstoqueMaster = countEstoqueMasterData?.length || 0;

        if (!estMasterErr) {
          estoquePorMasterId += countEstoqueMaster || 0;
          console.log(`      ✅ Estoque migrado por master_id: ${countEstoqueMaster || 0}`);
        } else {
          console.error(`      ⚠️ Erro estoque por master_id: ${estMasterErr.message}`);
        }

        // 2d. Migrar estoque por sku_global sem master_id (apoio legado)
        const { count: countEstoqueSku, error: estSkuErr } = await supabase
          .from('estoque_app')
          .update({
            produto_master_id: produtoMantido.id,
            sku_global: produtoMantido.sku_global
          })
          .eq('sku_global', produtoRemover.sku_global)
          .is('produto_master_id', null)
          .select('*', { count: 'exact', head: true });

        if (!estSkuErr) {
          estoquePorSkuLegado += countEstoqueSku || 0;
          if (countEstoqueSku) console.log(`      ✅ Estoque legado migrado por SKU: ${countEstoqueSku}`);
        }

        // 2e. Migrar candidatos de normalização
        const { count: countCandidatos, error: candErr } = await supabase
          .from('produtos_candidatos_normalizacao')
          .update({
            sugestao_produto_master: produtoMantido.id,
            sugestao_sku_global: produtoMantido.sku_global
          })
          .eq('sugestao_produto_master', produtoRemover.id)
          .select('*', { count: 'exact', head: true });

        if (!candErr) {
          candidatosMigrados += countCandidatos || 0;
          console.log(`      ✅ Candidatos migrados: ${countCandidatos || 0}`);
        }

        // 2f. Migrar preços atuais
        const { count: countPrecos, error: precosErr } = await supabase
          .from('precos_atuais')
          .update({ produto_master_id: produtoMantido.id })
          .eq('produto_master_id', produtoRemover.id)
          .select('*', { count: 'exact', head: true });

        if (!precosErr) {
          precosMigrados += countPrecos || 0;
          console.log(`      ✅ Preços migrados: ${countPrecos || 0}`);
        }

        // ── Coletar dados para enriquecimento (primeiro removido com valor vence) ──

        // codigo_barras
        if (!heranca.codigo_barras && produtoRemover.codigo_barras) {
          if (!produtoMantido.codigo_barras) {
            heranca.codigo_barras = produtoRemover.codigo_barras;
          } else if (produtoMantido.codigo_barras !== produtoRemover.codigo_barras) {
            conflitos.push(`codigo_barras: removido=${produtoRemover.codigo_barras}, preservado=${produtoMantido.codigo_barras}`);
          }
        }

        // imagem_url + imagem_path (bloco)
        if (!heranca.imagem_url && produtoRemover.imagem_url) {
          if (!produtoMantido.imagem_url) {
            heranca.imagem_url = produtoRemover.imagem_url;
            heranca.imagem_path = produtoRemover.imagem_path || null;
          }
        }

        // marca
        if (!heranca.marca && produtoRemover.marca) {
          if (!produtoMantido.marca) {
            heranca.marca = produtoRemover.marca;
          } else if (produtoMantido.marca !== produtoRemover.marca) {
            conflitos.push(`marca: removido=${produtoRemover.marca}, preservado=${produtoMantido.marca}`);
          }
        }

        // bloco quantidade (só se completo e coerente)
        if (!heranca.qtd_valor && produtoRemover.qtd_valor != null && produtoRemover.qtd_unidade != null) {
          if (produtoMantido.qtd_valor == null) {
            heranca.qtd_valor = produtoRemover.qtd_valor;
            heranca.qtd_unidade = produtoRemover.qtd_unidade;
            heranca.qtd_base = produtoRemover.qtd_base ?? null;
            heranca.unidade_base = produtoRemover.unidade_base ?? null;
          }
        }

        // tipo_embalagem
        if (!heranca.tipo_embalagem && produtoRemover.tipo_embalagem) {
          if (!produtoMantido.tipo_embalagem) {
            heranca.tipo_embalagem = produtoRemover.tipo_embalagem;
          }
        }

        // categoria (herdar se NULL ou 'OUTROS')
        if (!heranca.categoria && produtoRemover.categoria) {
          if (!produtoMantido.categoria || produtoMantido.categoria === 'OUTROS') {
            if (produtoRemover.categoria !== 'OUTROS') {
              heranca.categoria = produtoRemover.categoria;
            }
          }
        }

        // categoria_unidade
        if (!heranca.categoria_unidade && produtoRemover.categoria_unidade) {
          if (!produtoMantido.categoria_unidade) {
            heranca.categoria_unidade = produtoRemover.categoria_unidade;
          }
        }
      }

      // ── Passo 3: Enriquecimento do master preservado ──
      const totalNotasRemovidas = produtosRemover.reduce((acc, p) => acc + (p.total_notas || 0), 0);
      const totalUsuariosRemovidos = produtosRemover.reduce((acc, p) => acc + (p.total_usuarios || 0), 0);

      const updatePayload: Record<string, any> = {
        total_notas: (produtoMantido.total_notas || 0) + totalNotasRemovidas,
        total_usuarios: (produtoMantido.total_usuarios || 0) + totalUsuariosRemovidos
      };

      // Aplicar herança
      for (const [campo, valor] of Object.entries(heranca)) {
        if (valor != null) {
          updatePayload[campo] = valor;
          atributosHerdados.push(campo);
        }
      }

      const { error: updateMasterErr } = await supabase
        .from('produtos_master_global')
        .update(updatePayload)
        .eq('id', produtoMantido.id);

      if (updateMasterErr) {
        console.error('❌ Erro ao enriquecer master:', updateMasterErr.message);
      } else {
        console.log(`   ✅ Master enriquecido: contadores somados, atributos herdados: [${atributosHerdados.join(', ')}]`);
        if (conflitos.length > 0) {
          console.log(`   ⚠️ Conflitos registrados: ${conflitos.length}`);
        }
      }

      // ── Passo 4: Validação pré-delete ──
      console.log('   🔍 Validação pré-delete...');
      const remanescentes: Record<string, number> = {};
      let bloqueado = false;

      for (const removido of produtosRemover) {
        // Tabelas bloqueantes
        const checks = [
          { tabela: 'estoque_app', coluna: 'produto_master_id' },
          { tabela: 'precos_atuais', coluna: 'produto_master_id' },
          { tabela: 'produtos_candidatos_normalizacao', coluna: 'sugestao_produto_master' },
          { tabela: 'produtos_sinonimos_globais', coluna: 'produto_master_id' },
        ];

        for (const check of checks) {
          const { count, error: checkErr } = await supabase
            .from(check.tabela)
            .select('*', { count: 'exact', head: true })
            .eq(check.coluna, removido.id);

          if (!checkErr && count && count > 0) {
            const key = `${check.tabela}`;
            remanescentes[key] = (remanescentes[key] || 0) + count;
            bloqueado = true;
            console.error(`      ❌ Referência remanescente: ${check.tabela} tem ${count} registro(s) apontando para ${removido.id}`);
          }
        }
      }

      // normalizacao_decisoes_log (informativo, não bloqueia)
      let logHistoricoDecisoes = 0;
      for (const removido of produtosRemover) {
        const { count } = await supabase
          .from('normalizacao_decisoes_log')
          .select('*', { count: 'exact', head: true })
          .eq('produto_master_final', removido.id);
        logHistoricoDecisoes += count || 0;
      }
      if (logHistoricoDecisoes > 0) {
        console.log(`   ℹ️ normalizacao_decisoes_log: ${logHistoricoDecisoes} referência(s) histórica(s) (não bloqueia)`);
      }

      // ── Passo 5 ou Abort ──
      const detalheGrupo: DetalheGrupo = {
        mantido: produtoMantido.nome_padrao,
        mantido_sku: produtoMantido.sku_global,
        removidos: produtosRemover.map(p => p.nome_padrao),
        sinonimos_criados: sinonimosCriados,
        sinonimos_migrados: sinonimosMigrados,
        sinonimos_skip_unicidade: sinonimosSkipUnicidade,
        estoque_por_master_id: estoquePorMasterId,
        estoque_por_sku_legado: estoquePorSkuLegado,
        candidatos_migrados: candidatosMigrados,
        precos_migrados: precosMigrados,
        atributos_herdados: atributosHerdados,
        conflitos,
        validacao_pre_delete: bloqueado ? 'abortado' : 'ok',
        log_historico_decisoes: logHistoricoDecisoes,
        estoque_sincronizado: 0,
      };

      if (bloqueado) {
        detalheGrupo.referencias_remanescentes = remanescentes;
        console.error(`   ❌ ABORT: grupo "${produtoMantido.nome_padrao}" — referências remanescentes impediram delete`);
        detalhes.push(detalheGrupo);
        continue;
      }

      // Delete dos masters removidos
      const { error: deleteError } = await supabase
        .from('produtos_master_global')
        .delete()
        .in('id', remover_ids);

      if (deleteError) {
        console.error(`   ❌ FALHA CRÍTICA ao deletar duplicados: ${deleteError.message}`);
        detalheGrupo.validacao_pre_delete = 'abortado';
        detalheGrupo.erro = `Falha ao deletar: ${deleteError.message}`;
        detalhes.push(detalheGrupo);
        continue;
      }

      totalMastersRemovidos += remover_ids.length;
      console.log(`   ✅ ${remover_ids.length} master(s) removido(s)`);

      // Sync estoque (apenas metadados do catálogo)
      const { data: syncResult, error: syncError } = await supabase
        .rpc('sync_estoque_from_master', { p_master_id: manter_id });

      if (syncError) {
        console.error(`   ⚠️ Erro ao sincronizar estoque: ${syncError.message}`);
      } else {
        detalheGrupo.estoque_sincronizado = syncResult || 0;
        console.log(`   ✅ ${syncResult || 0} registro(s) de estoque sincronizado(s) (apenas metadados)`);
      }

      totalSinonimosGerados += sinonimosCriados + sinonimosMigrados;
      totalReferenciasAtualizadas += estoquePorMasterId + estoquePorSkuLegado + candidatosMigrados + precosMigrados;

      detalhes.push(detalheGrupo);
    }

    console.log(`\n✅ Fusão concluída:`);
    console.log(`   - ${grupos.length} grupo(s) processado(s)`);
    console.log(`   - ${totalMastersRemovidos} master(s) removido(s)`);
    console.log(`   - ${totalSinonimosGerados} sinônimo(s) criado(s)/migrado(s)`);
    console.log(`   - ${totalReferenciasAtualizadas} referência(s) atualizada(s)`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        total_grupos_processados: grupos.length,
        total_masters_removidos: totalMastersRemovidos,
        total_sinonimos: totalSinonimosGerados,
        total_referencias_atualizadas: totalReferenciasAtualizadas,
        detalhes
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message, sucesso: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
