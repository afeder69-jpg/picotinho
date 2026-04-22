import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

interface GrupoDuplicata {
  nome_base: string;
  marca: string | null;
  masters: any[];
  tipo: 'duplicata_real' | 'falso_positivo';
  razao?: string;
}

/**
 * Verifica se dois masters são realmente duplicatas (mesmo produto)
 * vs falsos positivos (produtos legítimos com tamanhos/variantes diferentes)
 */
function saoRealmenteDuplicatas(m1: any, m2: any): { duplicata: boolean; razao: string } {
  const n1 = m1.nome_padrao?.toUpperCase()?.trim() || '';
  const n2 = m2.nome_padrao?.toUpperCase()?.trim() || '';

  // 0. Se nome_padrao é idêntico (ignorando case), é duplicata independente de categoria
  if (n1 && n2 && n1 === n2) {
    return { duplicata: true, razao: `Nome padrão idêntico: "${n1}"` };
  }

  // 1. Categorias equivalentes (IA gera variações)
  const categoriasEquivalentes: Record<string, string> = {
    'ALIMENTOS': 'MERCEARIA',
  };

  // Categorias que podem ser confundidas mas são OK para duplicatas
  // (ex: LEITE pode ir em BEBIDAS ou LATICÍNIOS, OVOS em LATICÍNIOS ou MERCEARIA)
  const categoriasFleximeis = new Set([
    'BEBIDAS|LATICÍNIOS/FRIOS',
    'LATICÍNIOS/FRIOS|BEBIDAS',
    'LATICÍNIOS/FRIOS|MERCEARIA',
    'MERCEARIA|LATICÍNIOS/FRIOS',
    'HORTIFRUTI|MERCEARIA',
    'MERCEARIA|HORTIFRUTI',
    'CONGELADOS|MERCEARIA',
    'MERCEARIA|CONGELADOS',
    'CONGELADOS|LATICÍNIOS/FRIOS',
    'LATICÍNIOS/FRIOS|CONGELADOS',
    'LIMPEZA|MERCEARIA',
    'MERCEARIA|LIMPEZA',
  ]);

  const normCategoria = (cat: string | null) => {
    if (!cat) return '';
    const u = cat.toUpperCase();
    return categoriasEquivalentes[u] || u;
  };

  if (m1.categoria && m2.categoria) {
    const c1 = normCategoria(m1.categoria);
    const c2 = normCategoria(m2.categoria);
    if (c1 !== c2) {
      const parCat = `${c1}|${c2}`;
      if (!categoriasFleximeis.has(parCat)) {
        return { duplicata: false, razao: `Categorias diferentes: ${m1.categoria} vs ${m2.categoria}` };
      }
      // Categorias flexíveis — continuar verificação por nome/gramatura
    }
  }

  // Palavras exclusivas que indicam variantes diferentes quando um tem e outro não
  const variantesExclusivas = [
    'DIET', 'LIGHT', 'ZERO', 'ZERO LACTOSE', 'SEM LACTOSE', 'SEM SAL',
    'INTEGRAL', 'DESNATADO', 'SEMI DESNATADO',
    'LIMAO', 'MORANGO', 'FRAMBOESA', 'UVA', 'CHOCOLATE', 'BAUNILHA',
    'LARANJA', 'MANGA', 'PESSEGO', 'ABACAXI',
    'NATURAL', 'SABOR CEBOLA', 'SABOR ALHO',
    'EXTRA FINA', 'TRADICIONAL',
    'CASTANHA', 'QUINOA',
    'VERMELHO', 'BRANCO',
  ];

  for (const variante of variantesExclusivas) {
    const m1tem = n1.includes(variante);
    const m2tem = n2.includes(variante);
    // Se apenas um dos dois tem a variante, são produtos diferentes
    if (m1tem !== m2tem) {
      return { duplicata: false, razao: `Variante exclusiva "${variante}" presente em apenas um produto` };
    }
  }

  // Pares de variantes mutuamente exclusivas
  const paresMutuamenteExclusivos = [
    ['MORANGO', 'FRAMBOESA'], ['MORANGO', 'UVA'], ['LIMAO', 'LARANJA'],
    ['CHOCOLATE', 'BAUNILHA'], ['NATURAL', 'LIMAO'],
    ['COM SAL', 'SEM SAL'], ['LIGHT', 'TRADICIONAL'],
    ['DESNATADO', 'INTEGRAL'],
  ];

  for (const [v1, v2] of paresMutuamenteExclusivos) {
    const m1temV1 = n1.includes(v1) && !n2.includes(v1);
    const m2temV2 = n2.includes(v2) && !n1.includes(v2);
    const m1temV2 = n1.includes(v2) && !n2.includes(v2);
    const m2temV1 = n2.includes(v1) && !n1.includes(v1);

    if ((m1temV1 && m2temV2) || (m1temV2 && m2temV1)) {
      return { duplicata: false, razao: `Variantes diferentes: ${v1} vs ${v2}` };
    }
  }

  // 3. Verificar gramatura/volume
  if (m1.qtd_valor && m2.qtd_valor && m1.qtd_unidade && m2.qtd_unidade) {
    const normalizar = (val: number, un: string): { valor: number; unidade: string } => {
      const u = un.toUpperCase();
      if (u === 'KG' || u === 'K') return { valor: val * 1000, unidade: 'G' };
      if (u === 'L' || u === 'LT') return { valor: val * 1000, unidade: 'ML' };
      return { valor: val, unidade: u };
    };

    const norm1 = normalizar(m1.qtd_valor, m1.qtd_unidade);
    const norm2 = normalizar(m2.qtd_valor, m2.qtd_unidade);

    if (norm1.unidade !== norm2.unidade) {
      return { duplicata: false, razao: `Unidades incompatíveis: ${m1.qtd_valor}${m1.qtd_unidade} vs ${m2.qtd_valor}${m2.qtd_unidade}` };
    }

    const diff = Math.abs(norm1.valor - norm2.valor) / Math.max(norm1.valor, norm2.valor);
    if (diff > 0.15) {
      return { duplicata: false, razao: `Gramaturas diferentes (${(diff * 100).toFixed(0)}%): ${m1.qtd_valor}${m1.qtd_unidade} vs ${m2.qtd_valor}${m2.qtd_unidade}` };
    }
  }

  // 4. Mesmo EAN = definitivamente duplicata
  if (m1.codigo_barras && m2.codigo_barras && m1.codigo_barras === m2.codigo_barras) {
    return { duplicata: true, razao: `Mesmo EAN: ${m1.codigo_barras}` };
  }

  // 5. Nomes muito similares = duplicata
  return { duplicata: true, razao: `Mesmo nome_base + marca, gramatura compatível` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const body = await req.json().catch(() => ({}));
    const apenasRelatorio = body.apenas_relatorio === true;

    console.log(`🔍 Diagnosticando masters duplicados (modo: ${apenasRelatorio ? 'relatório' : 'consolidar'})...`);

    // 1. Buscar todos os masters ativos
    const { data: allMasters, error: mastersError } = await supabase
      .from('produtos_master_global')
      .select('id, sku_global, nome_padrao, nome_base, marca, categoria, codigo_barras, qtd_valor, qtd_unidade, qtd_base, unidade_base, created_at, total_notas, total_usuarios, status')
      .eq('status', 'ativo')
      .order('created_at', { ascending: true });

    if (mastersError) throw mastersError;

    console.log(`📊 Total de masters ativos: ${allMasters?.length || 0}`);

    // 2. Agrupar por (nome_base + marca)
    const grupos = new Map<string, any[]>();
    for (const master of allMasters || []) {
      const chave = `${(master.nome_base || '').toUpperCase()}|||${(master.marca || 'SEM_MARCA').toUpperCase()}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(master);
    }

    // 3. Filtrar grupos com 2+ masters e classificar
    const duplicatasReais: GrupoDuplicata[] = [];
    const falsosPositivos: GrupoDuplicata[] = [];

    for (const [, masters] of grupos) {
      if (masters.length < 2) continue;

      // Verificar pares dentro do grupo
      const subGrupoDuplicatas: any[] = [];
      const subGrupoUnicos: any[] = [];

      // Verificar cada par
      for (let i = 0; i < masters.length; i++) {
        let ehDuplicataDeAlguem = false;
        for (let j = 0; j < masters.length; j++) {
          if (i === j) continue;
          const resultado = saoRealmenteDuplicatas(masters[i], masters[j]);
          if (resultado.duplicata) {
            ehDuplicataDeAlguem = true;
            break;
          }
        }
        if (ehDuplicataDeAlguem) {
          subGrupoDuplicatas.push(masters[i]);
        } else {
          subGrupoUnicos.push(masters[i]);
        }
      }

      if (subGrupoDuplicatas.length >= 2) {
        // Encontrar a razão do primeiro par
        const razao = saoRealmenteDuplicatas(subGrupoDuplicatas[0], subGrupoDuplicatas[1]).razao;
        duplicatasReais.push({
          nome_base: masters[0].nome_base,
          marca: masters[0].marca,
          masters: subGrupoDuplicatas,
          tipo: 'duplicata_real',
          razao
        });
      }

      if (subGrupoUnicos.length > 0 || subGrupoDuplicatas.length < 2) {
        // Existe falso positivo neste grupo
        const todosDoGrupo = [...subGrupoUnicos, ...(subGrupoDuplicatas.length < 2 ? subGrupoDuplicatas : [])];
        if (todosDoGrupo.length >= 2) {
          const razao = saoRealmenteDuplicatas(masters[0], masters[1]).razao;
          falsosPositivos.push({
            nome_base: masters[0].nome_base,
            marca: masters[0].marca,
            masters: todosDoGrupo,
            tipo: 'falso_positivo',
            razao
          });
        }
      }
    }

    console.log(`🎯 Duplicatas reais: ${duplicatasReais.length} grupos`);
    console.log(`✅ Falsos positivos: ${falsosPositivos.length} grupos`);

    // 4. Se apenas relatório, retornar sem consolidar
    if (apenasRelatorio) {
      return new Response(
        JSON.stringify({
          sucesso: true,
          modo: 'relatorio',
          duplicatas_reais: duplicatasReais.map(g => ({
            nome_base: g.nome_base,
            marca: g.marca,
            quantidade: g.masters.length,
            razao: g.razao,
            produtos: g.masters.map(m => ({
              id: m.id,
              nome_padrao: m.nome_padrao,
              sku_global: m.sku_global,
              codigo_barras: m.codigo_barras,
              qtd_valor: m.qtd_valor,
              qtd_unidade: m.qtd_unidade,
              total_notas: m.total_notas,
              created_at: m.created_at
            }))
          })),
          falsos_positivos: falsosPositivos.map(g => ({
            nome_base: g.nome_base,
            marca: g.marca,
            quantidade: g.masters.length,
            razao: g.razao,
            produtos: g.masters.map(m => ({
              id: m.id,
              nome_padrao: m.nome_padrao,
              qtd_valor: m.qtd_valor,
              qtd_unidade: m.qtd_unidade
            }))
          })),
          total_duplicatas_reais: duplicatasReais.reduce((acc, g) => acc + g.masters.length - 1, 0),
          total_falsos_positivos: falsosPositivos.length,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. CONSOLIDAR duplicatas reais
    let totalRemovidos = 0;
    let totalSinonimos = 0;
    let totalRefEstoque = 0;
    let totalRefCandidatos = 0;
    const detalhes: any[] = [];

    for (const grupo of duplicatasReais) {
      console.log(`\n🔄 Consolidando: ${grupo.nome_base} (${grupo.marca || 'sem marca'}) - ${grupo.masters.length} masters`);

      // Ordenar: mais notas primeiro, depois mais antigo
      grupo.masters.sort((a: any, b: any) => {
        if ((b.total_notas || 0) !== (a.total_notas || 0)) {
          return (b.total_notas || 0) - (a.total_notas || 0);
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const principal = grupo.masters[0];
      const duplicados = grupo.masters.slice(1);

      console.log(`   ✅ Principal: ${principal.nome_padrao} (${principal.sku_global}, ${principal.total_notas || 0} notas)`);

      let sinonimosCriados = 0;
      let refEstoque = 0;
      let refCandidatos = 0;

      for (const dup of duplicados) {
        console.log(`   ❌ Removendo: ${dup.nome_padrao} (${dup.sku_global})`);

        // Criar sinônimo
        const { data: sinExistente } = await supabase
          .from('produtos_sinonimos_globais')
          .select('id')
          .eq('produto_master_id', principal.id)
          .eq('texto_variacao', dup.sku_global)
          .maybeSingle();

        if (!sinExistente) {
          const { error: sinError } = await supabase
            .from('produtos_sinonimos_globais')
            .insert({
              produto_master_id: principal.id,
              texto_variacao: dup.sku_global,
              fonte: 'consolidacao_diagnostico',
              confianca: 100,
              total_ocorrencias: dup.total_notas || 0,
              aprovado_em: new Date().toISOString()
            });
          if (!sinError) sinonimosCriados++;
        }

        // Atualizar estoque_app
        const { count: cEstoque } = await supabase
          .from('estoque_app')
          .update({
            produto_master_id: principal.id,
            sku_global: principal.sku_global,
            produto_hash_normalizado: principal.sku_global
          })
          .or(`produto_master_id.eq.${dup.id},sku_global.eq.${dup.sku_global}`)
          .select('*', { count: 'exact', head: true });
        refEstoque += cEstoque || 0;

        // Atualizar candidatos
        const { count: cCand } = await supabase
          .from('produtos_candidatos_normalizacao')
          .update({
            sugestao_produto_master: principal.id,
            sugestao_sku_global: principal.sku_global
          })
          .eq('sugestao_produto_master', dup.id)
          .select('*', { count: 'exact', head: true });
        refCandidatos += cCand || 0;

        // Somar estatísticas
        await supabase
          .from('produtos_master_global')
          .update({
            total_notas: (principal.total_notas || 0) + (dup.total_notas || 0),
            total_usuarios: (principal.total_usuarios || 0) + (dup.total_usuarios || 0)
          })
          .eq('id', principal.id);

        // Deletar duplicado
        const { error: delError } = await supabase
          .from('produtos_master_global')
          .delete()
          .eq('id', dup.id);

        if (!delError) {
          totalRemovidos++;
          console.log(`   ✔️ Removido: ${dup.sku_global}`);
        } else {
          console.error(`   ⚠️ Erro ao remover: ${delError.message}`);
        }
      }

      totalSinonimos += sinonimosCriados;
      totalRefEstoque += refEstoque;
      totalRefCandidatos += refCandidatos;

      detalhes.push({
        nome_base: grupo.nome_base,
        marca: grupo.marca,
        principal: principal.nome_padrao,
        principal_sku: principal.sku_global,
        removidos: duplicados.map((d: any) => d.nome_padrao),
        sinonimos_criados: sinonimosCriados,
        ref_estoque: refEstoque,
        ref_candidatos: refCandidatos
      });
    }

    console.log(`\n✅ Diagnóstico e consolidação concluídos!`);
    console.log(`   Grupos consolidados: ${duplicatasReais.length}`);
    console.log(`   Masters removidos: ${totalRemovidos}`);
    console.log(`   Sinônimos criados: ${totalSinonimos}`);
    console.log(`   Falsos positivos preservados: ${falsosPositivos.length}`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        modo: 'consolidar',
        total_grupos_consolidados: duplicatasReais.length,
        total_masters_removidos: totalRemovidos,
        total_sinonimos_criados: totalSinonimos,
        total_ref_estoque: totalRefEstoque,
        total_ref_candidatos: totalRefCandidatos,
        falsos_positivos_preservados: falsosPositivos.length,
        detalhes,
        falsos_positivos_detalhes: falsosPositivos.map(g => ({
          nome_base: g.nome_base,
          marca: g.marca,
          razao: g.razao,
          produtos: g.masters.map((m: any) => m.nome_padrao)
        })),
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message, sucesso: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
