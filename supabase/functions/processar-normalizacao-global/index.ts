import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";
import { chamarIANormalizacao } from "../_shared/ia-cliente.ts";
import { verificarAntiDuplicata } from "../_shared/anti-duplicata.ts";
// Interfaces e função para detecção de embalagem via tabela de regras
interface RegraConversao {
  produto_pattern: string;
  produto_exclusao_pattern: string | null;
  ean_pattern: string | null;
  tipo_embalagem: string;
  qtd_por_embalagem: number;
  unidade_consumo: string;
  prioridade: number;
}

interface ResultadoEmbalagemNorm {
  isMultiUnit: boolean;
  quantity: number;
  tipo_embalagem: string | null;
  unidade_consumo: string;
}

function detectarQuantidadeEmbalagem(
  nomeProduto: string,
  regras: RegraConversao[],
  eanProduto?: string | null
): ResultadoEmbalagemNorm {
  const nomeUpper = nomeProduto.toUpperCase();
  const fallback: ResultadoEmbalagemNorm = { isMultiUnit: false, quantity: 1, tipo_embalagem: null, unidade_consumo: 'UN' };

  if (!regras || regras.length === 0) return fallback;

  if (eanProduto) {
    for (const regra of regras) {
      if (!regra.ean_pattern) continue;
      try {
        if (!new RegExp(regra.ean_pattern, 'i').test(eanProduto)) continue;
        if (regra.produto_exclusao_pattern && new RegExp(regra.produto_exclusao_pattern, 'i').test(nomeUpper)) continue;
        const qty = regra.qtd_por_embalagem;
        if (qty > 1 && qty <= 100) {
          console.log(`🥚 EMBALAGEM NORM (EAN): "${nomeProduto}" → ${qty} ${regra.unidade_consumo}`);
          return { isMultiUnit: true, quantity: qty, tipo_embalagem: regra.tipo_embalagem, unidade_consumo: regra.unidade_consumo };
        }
      } catch (e) { console.warn('Regex EAN inválido:', regra.ean_pattern, e); }
    }
  }

  for (const regra of regras) {
    try {
      if (!new RegExp(regra.produto_pattern, 'i').test(nomeUpper)) continue;
      if (regra.produto_exclusao_pattern && new RegExp(regra.produto_exclusao_pattern, 'i').test(nomeUpper)) continue;
      const qty = regra.qtd_por_embalagem;
      if (qty > 1 && qty <= 100) {
        console.log(`🥚 EMBALAGEM NORM (NOME): "${nomeProduto}" → ${qty} ${regra.unidade_consumo}`);
        return { isMultiUnit: true, quantity: qty, tipo_embalagem: regra.tipo_embalagem, unidade_consumo: regra.unidade_consumo };
      }
    } catch (e) { console.warn('Regex nome inválido:', regra.produto_pattern, e); }
  }

  return fallback;
}

interface ProdutoParaNormalizar {
  texto_original: string;
  usuario_id?: string;
  nota_imagem_id?: string;
  nota_item_hash?: string;
  open_food_facts_id?: string;
  origem: 'nota_fiscal' | 'open_food_facts';
  codigo_barras?: string;
  dados_brutos?: any;
  imagem_url?: string;
  imagem_path?: string;
  // 🎯 ID do candidato (preenchido em MODO_CANDIDATOS_DIRETO).
  // Quando presente, criarCandidato faz lookup/UPDATE pelo id em vez de (nota_imagem_id, texto_original).
  candidato_id?: string;
}

interface NormalizacaoSugerida {
  sku_global: string;
  nome_padrao: string;
  categoria: string;
  nome_base: string;
  marca: string | null;
  tipo_embalagem: string | null;
  qtd_valor: number | null;
  qtd_unidade: string | null;
  qtd_base: number | null;
  unidade_base: string | null;
  categoria_unidade: string | null;
  granel: boolean;
  confianca: number;
  razao: string;
  produto_master_id: string | null;
  imagem_url?: string;
  imagem_path?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  // Parse body opcional para controle de modo teste
  let bodyOpts: { modo_teste?: boolean; limite_candidatos?: number; limite_notas?: number; candidato_ids?: string[] } = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      bodyOpts = await req.json().catch(() => ({}));
    }
  } catch (_) {}
  const MODO_TESTE = bodyOpts.modo_teste === true;
  const LIMITE_CANDIDATOS = MODO_TESTE
    ? Math.max(1, Math.min(20, Number(bodyOpts.limite_candidatos) || 5))
    : null; // null = sem cap (comportamento original)
  const LIMITE_NOTAS_INPUT = Math.max(1, Math.min(5, Number(bodyOpts.limite_notas) || (MODO_TESTE ? 2 : 5)));
  const CANDIDATO_IDS = Array.isArray(bodyOpts.candidato_ids)
    ? bodyOpts.candidato_ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const MODO_CANDIDATOS_DIRETO = CANDIDATO_IDS.length > 0;
  const debugTrace: string[] = [];
  const pushDebug = (mensagem: string, dados?: Record<string, unknown>) => {
    const linha = dados ? `${mensagem} ${JSON.stringify(dados)}` : mensagem;
    debugTrace.push(linha);
    console.log(linha);
  };

  try {
    pushDebug('🚀 Iniciando processamento de normalização global', {
      modo_teste: MODO_TESTE,
      cap_candidatos: LIMITE_CANDIDATOS ?? 'sem cap',
      limite_notas_input: LIMITE_NOTAS_INPUT,
      modo_candidatos_direto: MODO_CANDIDATOS_DIRETO,
      candidato_ids_recebidos: CANDIDATO_IDS,
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 🥚 Carregar regras de conversão de embalagem
    const { data: regrasConversao } = await supabase
      .from('regras_conversao_embalagem')
      .select('produto_pattern, produto_exclusao_pattern, ean_pattern, tipo_embalagem, qtd_por_embalagem, unidade_consumo, prioridade')
      .eq('ativo', true)
      .eq('tipo_conversao', 'fixa')
      .order('prioridade', { ascending: true });
    const regrasEmbalagem: RegraConversao[] = (regrasConversao || []) as RegraConversao[];
    console.log(`📦 Regras de conversão carregadas: ${regrasEmbalagem.length}`);

    // 1. BUSCAR PRODUTOS DE NOTAS NÃO NORMALIZADAS
    console.log('📋 Buscando produtos para normalizar...');

    const produtosParaNormalizar: ProdutoParaNormalizar[] = [];
    const notasIds: string[] = [];
    const notasMetadata = new Map<string, { totalItens: number, itensProcessados: number }>();

    if (MODO_CANDIDATOS_DIRETO) {
      // 🎯 SELEÇÃO DIRETA POR CANDIDATO (vinda de reprocessar-candidatos-orfaos).
      // Bypass da varredura por nota: garante que processamos EXATAMENTE os candidatos elegíveis.
      pushDebug('🎯 Entrou no branch MODO_CANDIDATOS_DIRETO', {
        quantidade_ids: CANDIDATO_IDS.length,
        candidato_ids: CANDIDATO_IDS,
      });

      const { data: candidatosAlvo, error: candErr } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('id, nota_imagem_id, nota_item_hash, texto_original, usuario_id, status, precisa_ia, motivo_bloqueio')
        .in('id', CANDIDATO_IDS);
      if (candErr) throw new Error(`Erro ao buscar candidatos: ${candErr.message}`);
      pushDebug('📥 Candidatos carregados do banco no modo direto', {
        retornados: candidatosAlvo?.length || 0,
        ids_retornados: (candidatosAlvo || []).map((c: any) => c.id),
      });

      // 🔒 Re-validar elegibilidade no momento do processamento
      const elegiveis = (candidatosAlvo || []).filter(c =>
        c.status === 'pendente' && c.precisa_ia === true && !c.motivo_bloqueio && c.nota_imagem_id && c.texto_original
      );
      const descartados = (candidatosAlvo?.length || 0) - elegiveis.length;
      pushDebug('📋 Candidatos elegíveis confirmados no modo direto', {
        elegiveis: elegiveis.length,
        descartados,
        exemplos_descartados: (candidatosAlvo || [])
          .filter((c: any) => !(c.status === 'pendente' && c.precisa_ia === true && !c.motivo_bloqueio && c.nota_imagem_id && c.texto_original))
          .slice(0, 5)
          .map((c: any) => ({
            id: c.id,
            status: c.status,
            precisa_ia: c.precisa_ia,
            motivo_bloqueio: c.motivo_bloqueio,
            nota_imagem_id: c.nota_imagem_id,
            tem_texto_original: !!c.texto_original,
          })),
      });

      for (const c of elegiveis) {
        produtosParaNormalizar.push({
          texto_original: c.texto_original,
          usuario_id: c.usuario_id,
          nota_imagem_id: c.nota_imagem_id,
          origem: 'nota_fiscal',
          nota_item_hash: c.nota_item_hash || `${c.nota_imagem_id}-${c.id}-${(c.texto_original || '').slice(0, 20)}`,
        });
        if (!notasIds.includes(c.nota_imagem_id)) notasIds.push(c.nota_imagem_id);
      }
    } else {
      const { data: notasProcessadas, error: notasError } = await supabase
        .from('notas_imagens')
        .select('id, usuario_id, dados_extraidos')
        .eq('processada', true)
        .eq('normalizada', false)
        .not('dados_extraidos', 'is', null)
        .limit(LIMITE_NOTAS_INPUT); // ✅ Fase 1: até 5 notas / modo_teste: até limite_notas

      if (notasError) {
        throw new Error(`Erro ao buscar notas: ${notasError.message}`);
      }

      console.log(`📦 Notas fiscais: ${notasProcessadas?.length || 0} notas processadas`);

      // 2. BUSCAR PRODUTOS DO OPEN FOOD FACTS NÃO NORMALIZADOS
      // ⚠️ Em modo_teste, pular Open Food Facts para limitar escopo
      const { data: openFoodProducts, error: offError } = MODO_TESTE
        ? { data: [] as any[], error: null }
        : await supabase
        .from('open_food_facts_staging')
        .select('id, codigo_barras, texto_original, dados_brutos, imagem_url, imagem_path')
        .eq('processada', false)
        .limit(100);

      if (offError) {
        console.warn(`⚠️ Erro ao buscar Open Food Facts: ${offError.message}`);
      }

      console.log(`🌍 Open Food Facts: ${openFoodProducts?.length || 0} produtos para normalizar`);

      // Extrair produtos de cada nota fiscal com hash único por item
      for (const nota of notasProcessadas || []) {
        const itens = nota.dados_extraidos?.itens || [];
        notasMetadata.set(nota.id, { totalItens: itens.length, itensProcessados: 0 });

        for (let i = 0; i < itens.length; i++) {
          const item = itens[i];
          const descricao = item.descricao || item.nome;
          if (descricao) {
            const notaItemHash = `${nota.id}-${i}-${descricao.slice(0, 20)}`;
            produtosParaNormalizar.push({
              texto_original: descricao,
              usuario_id: nota.usuario_id,
              nota_imagem_id: nota.id,
              origem: 'nota_fiscal',
              nota_item_hash: notaItemHash
            });
          }
        }
        notasIds.push(nota.id);
      }

      // Adicionar produtos do Open Food Facts
      for (const offProduto of openFoodProducts || []) {
        produtosParaNormalizar.push({
          texto_original: offProduto.texto_original,
          open_food_facts_id: offProduto.id,
          origem: 'open_food_facts',
          codigo_barras: offProduto.codigo_barras,
          dados_brutos: offProduto.dados_brutos,
          imagem_url: offProduto.imagem_url,
          imagem_path: offProduto.imagem_path
        });
      }
    }

    pushDebug('📊 produtosParaNormalizar montado', {
      quantidade: produtosParaNormalizar.length,
      origem: MODO_CANDIDATOS_DIRETO ? 'modo_candidatos_direto' : 'varredura_por_notas',
      primeiros_itens: produtosParaNormalizar.slice(0, 5).map((p) => ({
        texto_original: p.texto_original,
        nota_imagem_id: p.nota_imagem_id,
        nota_item_hash: p.nota_item_hash,
        origem: p.origem,
      })),
    });

    // 🛑 MODO TESTE: limitar quantidade real de candidatos processados
    let candidatosTruncados = 0;
    if (LIMITE_CANDIDATOS !== null && produtosParaNormalizar.length > LIMITE_CANDIDATOS) {
      candidatosTruncados = produtosParaNormalizar.length - LIMITE_CANDIDATOS;
      produtosParaNormalizar.length = LIMITE_CANDIDATOS;
      console.log(`✂️  MODO TESTE: cap aplicado → processando ${LIMITE_CANDIDATOS} candidatos (${candidatosTruncados} ignorados)`);
    }

    // ✅ VALIDAÇÃO: Retornar early se não houver produtos novos
    if (produtosParaNormalizar.length === 0) {
      pushDebug('ℹ️ produtosParaNormalizar ficou vazio', {
        motivo: MODO_CANDIDATOS_DIRETO
          ? 'Todos os candidato_ids recebidos foram descartados na revalidação de elegibilidade ou não retornaram da consulta por id.'
          : 'A varredura de notas/Open Food Facts não encontrou itens elegíveis para processamento.',
      });
      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: 'Nenhum produto novo para processar',
          total_produtos: 0,
          processados: 0,
          auto_aprovados: 0,
          para_revisao: 0,
          timestamp: new Date().toISOString(),
          debug: {
            modo_teste: MODO_TESTE,
            modo_candidatos_direto: MODO_CANDIDATOS_DIRETO,
            candidato_ids_recebidos: CANDIDATO_IDS,
            produtos_para_normalizar: 0,
            trace: debugTrace,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. PROCESSAR EM LOTES
    // ⚠️ Em modo_teste, usar lote = total para 1 ciclo único (sem múltiplas iterações)
    const LOTE_SIZE = MODO_TESTE ? produtosParaNormalizar.length : 10;
    let totalProcessados = 0;
    let totalAutoAprovados = 0;
    let totalParaRevisao = 0;

    for (let i = 0; i < produtosParaNormalizar.length; i += LOTE_SIZE) {
      const lote = produtosParaNormalizar.slice(i, i + LOTE_SIZE);
      console.log(`\n📦 Processando lote ${Math.floor(i / LOTE_SIZE) + 1}/${Math.ceil(produtosParaNormalizar.length / LOTE_SIZE)}`);

      for (const produto of lote) {
        let tentativas = 0;
        const MAX_TENTATIVAS = 3;
        
        try {
          // 🥚 DETECTAR PRODUTOS MULTI-UNIDADE (OVOS)
          const embalagemInfo = detectarQuantidadeEmbalagem(produto.texto_original, regrasEmbalagem);

          let textoParaNormalizar = produto.texto_original;
          let obsEmbalagem: string | null = null;

          if (embalagemInfo.isMultiUnit) {
            // Remover quantidade da embalagem para normalizar como produto unitário
            textoParaNormalizar = produto.texto_original
              .replace(/\bC\/\d+\b/i, '')
              .replace(/\b\d+\s*UN(IDADES)?\b/i, '')
              .replace(/\b\d+\s*OVO(S)?\b/i, '')
              .replace(/\bDZ\d+\b/i, '')
              .trim();
            
            obsEmbalagem = `Produto multi-unidade detectado: ${embalagemInfo.quantity} unidades na embalagem original. Normalizado como 1 unidade.`;
            
            console.log(`🥚 OVOS MULTI-UNIDADE: "${produto.texto_original}" → "${textoParaNormalizar}" (${embalagemInfo.quantity} un)`);
          }
          
          // Verificar se já foi normalizado usando hash único
          const { data: jaExiste } = await supabase
            .from('produtos_candidatos_normalizacao')
            .select('id, status, sugestao_produto_master, sugestao_sku_global, nome_padrao_sugerido, marca_sugerida, nome_base_sugerido, categoria_sugerida, confianca_ia, precisa_ia')
            .eq('nota_item_hash', produto.nota_item_hash)
            .maybeSingle();

          // 🆕 FASE 1: candidatos órfãos (placeholders pendentes sem IA) NÃO devem ser pulados.
          // Detectar e seguir o pipeline normal — criarCandidato() faz UPDATE no existente.
          const ehOrfao = !!jaExiste
            && jaExiste.status === 'pendente'
            && (jaExiste.precisa_ia === true || (Number(jaExiste.confianca_ia ?? 0) === 0 && !jaExiste.nome_padrao_sugerido));

          if (jaExiste && !ehOrfao) {
            pushDebug('⏭️ Produto ignorado por já ter candidato não órfão', {
              texto_original: produto.texto_original,
              nota_item_hash: produto.nota_item_hash,
              status_existente: jaExiste.status,
              precisa_ia_existente: jaExiste.precisa_ia,
              confianca_ia_existente: Number(jaExiste.confianca_ia ?? 0),
              ehOrfao,
            });
            
            // 🔗 CORREÇÃO RAIZ: Se candidato já foi aprovado, vincular novo item do estoque ao master
            if (jaExiste.status === 'auto_aprovado' && jaExiste.sugestao_produto_master && produto.nota_imagem_id) {
              console.log(`🔗 Re-vinculando item reprocessado ao master aprovado: ${jaExiste.sugestao_produto_master}`);
              
              // Buscar detalhes do master para atualização completa
              const { data: masterDetails } = await supabase
                .from('produtos_master_global')
                .select('imagem_url, nome_padrao, marca, nome_base, categoria')
                .eq('id', jaExiste.sugestao_produto_master)
                .single();
              
              // Atualizar estoque com vínculo ao master
              const updateData: any = {
                produto_master_id: jaExiste.sugestao_produto_master,
                sku_global: jaExiste.sugestao_sku_global,
                produto_candidato_id: null, // Limpar candidato pois já aprovado
                updated_at: new Date().toISOString()
              };
              
              if (masterDetails) {
                updateData.produto_nome = masterDetails.nome_padrao;
                updateData.produto_nome_normalizado = masterDetails.nome_padrao;
                updateData.nome_base = masterDetails.nome_base;
                updateData.marca = masterDetails.marca;
                updateData.categoria = masterDetails.categoria?.toLowerCase();
                if (masterDetails.imagem_url) {
                  updateData.imagem_url = masterDetails.imagem_url;
                }
              }
              
              await supabase
                .from('estoque_app')
                .update(updateData)
                .eq('produto_candidato_id', jaExiste.id); // ✅ FK direta - mais confiável que match de string
              
              console.log(`✅ Item reprocessado vinculado ao master: ${masterDetails?.nome_padrao || jaExiste.sugestao_sku_global}`);
            }
            
            // ✅ Marcar item como processado no metadata
            if (produto.nota_imagem_id && notasMetadata.has(produto.nota_imagem_id)) {
              const metadata = notasMetadata.get(produto.nota_imagem_id)!;
              metadata.itensProcessados++;
            }
            
            // ✅ Marcar como processado no Open Food Facts
            if (produto.origem === 'open_food_facts' && produto.open_food_facts_id) {
              await supabase
                .from('open_food_facts_staging')
                .update({ processada: true })
                .eq('id', produto.open_food_facts_id);
              console.log(`✅ Marcado como processado: ${produto.open_food_facts_id}`);
            }
            
            continue;
          }

          // 🛡️ ESTRATÉGIA 0: Busca por EAN (codigo_barras) — prioridade máxima
          if (produto.codigo_barras) {
            const eanLimpo = produto.codigo_barras.replace(/\D/g, '');
            if (eanLimpo.length >= 8) {
              const eanCanon = eanLimpo.replace(/^0+/, '');
              const variantesEan = new Set<string>([eanCanon]);
              for (const len of [8, 12, 13, 14]) {
                if (eanCanon.length <= len) variantesEan.add(eanCanon.padStart(len, '0'));
              }
              console.log(`🔍 Estratégia 0: Buscando por EAN ${eanLimpo} (variantes: ${Array.from(variantesEan).join(',')})...`);
              const { data: mastersPorEanRaw } = await supabase
                .from('produtos_master_global')
                .select('*')
                .in('codigo_barras', Array.from(variantesEan))
                .eq('status', 'ativo')
                .eq('provisorio', false)
                .limit(5);

              const mastersPorEan = mastersPorEanRaw
                ? Array.from(new Map(mastersPorEanRaw.map((m: any) => [m.id, m])).values())
                : [];

              if (mastersPorEan && mastersPorEan.length === 1) {
                const masterEan = mastersPorEan[0];
                console.log(`✅ EAN Match único: ${masterEan.nome_padrao} (${masterEan.sku_global})`);

                const normEan: NormalizacaoSugerida = {
                  sku_global: masterEan.sku_global,
                  nome_padrao: masterEan.nome_padrao,
                  categoria: masterEan.categoria,
                  nome_base: masterEan.nome_base,
                  marca: masterEan.marca,
                  tipo_embalagem: masterEan.tipo_embalagem,
                  qtd_valor: masterEan.qtd_valor,
                  qtd_unidade: masterEan.qtd_unidade,
                  qtd_base: masterEan.qtd_base,
                  unidade_base: masterEan.unidade_base,
                  categoria_unidade: masterEan.categoria_unidade,
                  granel: masterEan.granel,
                  confianca: 100,
                  razao: `Match EAN exato: ${eanLimpo}`,
                  produto_master_id: masterEan.id,
                  imagem_url: produto.imagem_url || null,
                  imagem_path: produto.imagem_path || null
                };

                await criarCandidato(supabase, produto, normEan, 'auto_aprovado', obsEmbalagem);
                await supabase.rpc('criar_sinonimo_global', {
                  produto_master_id_input: masterEan.id,
                  texto_variacao_input: produto.texto_original,
                  confianca_input: 100
                });

                totalAutoAprovados++;
                if (produto.origem === 'open_food_facts' && produto.open_food_facts_id) {
                  await supabase.from('open_food_facts_staging').update({ processada: true }).eq('id', produto.open_food_facts_id);
                }
                if (produto.nota_imagem_id && notasMetadata.has(produto.nota_imagem_id)) {
                  notasMetadata.get(produto.nota_imagem_id)!.itensProcessados++;
                }
                totalProcessados++;
                continue;
              } else if (mastersPorEan && mastersPorEan.length > 1) {
                console.log(`⚠️ EAN ${eanLimpo} tem ${mastersPorEan.length} masters — duplicata detectada, prosseguindo com IA`);
              }
            }
          }

          // 🔍 BUSCA MULTI-CAMADA INTELIGENTE
          const resultadoBusca = await buscarProdutoSimilar(
            supabase,
            textoParaNormalizar,
            textoParaNormalizar.toUpperCase().trim()
          );

          // Adicionar campos de imagem se existirem
          let normalizacao: NormalizacaoSugerida;

          // Se encontrou match direto (Camada 1 ou 2 - sinônimo ou fuzzy)
          if (resultadoBusca.encontrado && resultadoBusca.produto) {
            console.log(`✅ ${resultadoBusca.metodo}: ${resultadoBusca.produto.nome_padrao} (${resultadoBusca.confianca}%)`);
            
            // Criar normalizacao com dados do produto encontrado
            normalizacao = {
              sku_global: resultadoBusca.produto.sku_global,
              nome_padrao: resultadoBusca.produto.nome_padrao,
              categoria: resultadoBusca.produto.categoria,
              nome_base: resultadoBusca.produto.nome_base,
              marca: resultadoBusca.produto.marca,
              tipo_embalagem: resultadoBusca.produto.tipo_embalagem,
              qtd_valor: resultadoBusca.produto.qtd_valor,
              qtd_unidade: resultadoBusca.produto.qtd_unidade,
              qtd_base: resultadoBusca.produto.qtd_base,
              unidade_base: resultadoBusca.produto.unidade_base,
              categoria_unidade: resultadoBusca.produto.categoria_unidade,
              granel: resultadoBusca.produto.granel,
              confianca: resultadoBusca.confianca,
              razao: `Match ${resultadoBusca.metodo}`,
              produto_master_id: resultadoBusca.produto.id,
              imagem_url: produto.imagem_url || null,
              imagem_path: produto.imagem_path || null
            };

            // 🔄 RETRY: Tentar criar candidato até 3x
            while (tentativas < MAX_TENTATIVAS) {
              try {
                await criarCandidato(supabase, produto, normalizacao, 'auto_aprovado', obsEmbalagem);
                break;
              } catch (erro: any) {
                tentativas++;
                if (tentativas >= MAX_TENTATIVAS) {
                  throw erro;
                }
                await new Promise(r => setTimeout(r, 1000 * tentativas));
              }
            }
            
            // Criar sinônimo se for texto novo
            await supabase.rpc('criar_sinonimo_global', {
              produto_master_id_input: resultadoBusca.produto.id,
              texto_variacao_input: produto.texto_original,
              confianca_input: resultadoBusca.confianca
            });
            
            totalAutoAprovados++;
            
          } else {
            // Camada 3: Enviar para IA com contexto inteligente (apenas candidatos relevantes)
            console.log(`🤖 Enviando para IA com ${resultadoBusca.candidatos?.length || 0} candidatos contextuais`);
            
            normalizacao = await normalizarComIA(
              textoParaNormalizar,
              resultadoBusca.candidatos || [],
              lovableApiKey,
              embalagemInfo,
              supabase,
              produto,
              MODO_TESTE ? 20000 : 45000
            );

            // 🛑 Falha total da IA — manter pendente, NÃO criar master, NÃO inventar fallback.
            if (!normalizacao) {
              console.warn(`⚠️ IA falhou para "${produto.texto_original}" — mantido pendente para reprocessamento.`);
              await supabase
                .from('produtos_candidatos_normalizacao')
                .update({ precisa_ia: true })
                .eq('nota_item_hash', produto.nota_item_hash);
              totalParaRevisao++;
              continue;
            }

            // Adicionar campos de imagem
            if (produto.imagem_url) {
              normalizacao.imagem_url = produto.imagem_url;
            }
            if (produto.imagem_path) {
              normalizacao.imagem_path = produto.imagem_path;
            }

            // Processar resultado da IA com retry
            tentativas = 0; // Reset tentativas para IA
            
            if (normalizacao.produto_master_id) {
              // IA encontrou variação - auto-aprovar + criar sinônimo
              while (tentativas < MAX_TENTATIVAS) {
                try {
                  await criarCandidato(supabase, produto, normalizacao, 'auto_aprovado', obsEmbalagem);
                  break;
                } catch (erro: any) {
                  tentativas++;
                  if (tentativas >= MAX_TENTATIVAS) throw erro;
                  await new Promise(r => setTimeout(r, 1000 * tentativas));
                }
              }
              
              await supabase.rpc('criar_sinonimo_global', {
                produto_master_id_input: normalizacao.produto_master_id,
                texto_variacao_input: produto.texto_original,
                confianca_input: normalizacao.confianca
              });
              
              totalAutoAprovados++;
              console.log(`✅ Auto-aprovado pela IA (variação reconhecida): ${normalizacao.nome_padrao}`);
              
            } else if (normalizacao.confianca >= 90) {
              // 🛡️ ANTI-DUPLICATA: bloqueia criação se houver master estruturalmente próximo
              const antiDup = await verificarAntiDuplicata(
                supabase,
                {
                  nome_padrao: normalizacao.nome_padrao,
                  nome_base: normalizacao.nome_base,
                  marca: normalizacao.marca,
                  categoria: normalizacao.categoria,
                  qtd_base: normalizacao.qtd_base,
                  unidade_base: normalizacao.unidade_base,
                },
                produto.codigo_barras
              );

              if (antiDup.bloquear) {
                console.warn(`🛡️ Anti-duplicata bloqueou criação de "${normalizacao.nome_padrao}" — motivo=${antiDup.motivo}`);
                // ✅ Decisão terminal: pendente_revisao + motivo_bloqueio gravados no MESMO update
                await criarCandidato(
                  supabase,
                  produto,
                  normalizacao,
                  'pendente_revisao',
                  obsEmbalagem,
                  { motivo_bloqueio: antiDup.motivo, candidatos_proximos: antiDup.candidatos }
                );
                totalParaRevisao++;
              } else {
                // Produto novo com alta confiança - criar master PROVISÓRIO + auto-aprovar
                while (tentativas < MAX_TENTATIVAS) {
                  try {
                    const masterCriado = await criarProdutoMaster(supabase, normalizacao, produto.codigo_barras, true);
                    normalizacao.produto_master_id = masterCriado.id;
                    console.log(`🔗 Master PROVISÓRIO criado e vinculado: ${masterCriado.id}`);
                    await criarCandidato(supabase, produto, normalizacao, 'auto_aprovado', obsEmbalagem);
                    break;
                  } catch (erro: any) {
                    tentativas++;
                    if (tentativas >= MAX_TENTATIVAS) throw erro;
                    await new Promise(r => setTimeout(r, 1000 * tentativas));
                  }
                }
                totalAutoAprovados++;
                console.log(`✅ Auto-aprovado pela IA (master provisório ${normalizacao.confianca}%): ${normalizacao.nome_padrao}`);
              }
              
            } else {
              // Baixa confiança - enviar para revisão manual
              while (tentativas < MAX_TENTATIVAS) {
                try {
                  await criarCandidato(supabase, produto, normalizacao, 'pendente', obsEmbalagem);
                  break;
                } catch (erro: any) {
                  tentativas++;
                  if (tentativas >= MAX_TENTATIVAS) throw erro;
                  await new Promise(r => setTimeout(r, 1000 * tentativas));
                }
              }
              totalParaRevisao++;
              console.log(`⏳ Para revisão (${normalizacao.confianca}%): ${normalizacao.nome_padrao}`);
            }
          }

          // Marcar Open Food Facts como processado
          if (produto.origem === 'open_food_facts' && produto.open_food_facts_id) {
            await supabase
              .from('open_food_facts_staging')
              .update({ processada: true })
              .eq('id', produto.open_food_facts_id);
          }

          // ✅ Marcar item como processado com sucesso
          if (produto.nota_imagem_id && notasMetadata.has(produto.nota_imagem_id)) {
            const metadata = notasMetadata.get(produto.nota_imagem_id)!;
            metadata.itensProcessados++;
          }
          
          totalProcessados++;

        } catch (erro: any) {
          console.error(`❌ Erro ao processar produto "${produto.texto_original}":`, erro.message);
          
          // 🔄 RETRY COM BACKOFF
          while (tentativas < MAX_TENTATIVAS) {
            tentativas++;
            console.log(`🔄 Tentativa ${tentativas}/${MAX_TENTATIVAS} para: ${produto.texto_original}`);
            
            try {
              await new Promise(r => setTimeout(r, 1000 * tentativas));
              // Retentar o processamento completo aqui seria complexo, então apenas logamos
              break;
            } catch (retryErro: any) {
              console.error(`❌ Retry ${tentativas} falhou:`, retryErro.message);
              if (tentativas >= MAX_TENTATIVAS) {
                // ❌ Logar falha definitiva
                await supabase.from('normalizacao_falhas').insert({
                  nota_imagem_id: produto.nota_imagem_id,
                  texto_original: produto.texto_original,
                  erro_mensagem: erro.message,
                  tentativas: MAX_TENTATIVAS
                });
                console.error(`❌ Produto perdido após ${MAX_TENTATIVAS} tentativas: ${produto.texto_original}`);
              }
            }
          }
        }
      }

      if (i + LOTE_SIZE < produtosParaNormalizar.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // ✅ NORMALIZAÇÃO INCREMENTAL: cada candidato é unidade independente.
    // Nota é marcada normalizada=true quando TODO item tem decisão terminal:
    //   - auto_aprovado, aprovado, rejeitado, pendente_revisao → decididos
    //   - pendente COM motivo_bloqueio → decisão (anti-duplicata)
    //   - pendente SEM motivo_bloqueio E precisa_ia=true → órfão real (não decidido)
    let notasTotalmenteDecididas = 0;
    let notasComOrfaosRestantes = 0;
    let notasFalharam = 0;
    
    console.log(`\n📝 Avaliando estado incremental de ${notasIds.length} notas...`);
    
    if (notasIds.length > 0) {
      for (const notaId of notasIds) {
        try {
          const metadata = notasMetadata.get(notaId);
          const totalItens = metadata?.totalItens ?? null;
          
          // Conta órfãos remanescentes (única condição que impede marcar nota como completa)
          const { count: itensOrfaos } = await supabase
            .from('produtos_candidatos_normalizacao')
            .select('*', { count: 'exact', head: true })
            .eq('nota_imagem_id', notaId)
            .eq('status', 'pendente')
            .is('motivo_bloqueio', null)
            .eq('precisa_ia', true);
          
          console.log(`📊 Nota ${notaId}: ${itensOrfaos ?? 0} órfãos restantes (de ${totalItens ?? '?'} itens)`);
          
          if ((itensOrfaos ?? 0) === 0) {
            const { error: updateError } = await supabase
              .from('notas_imagens')
              .update({ 
                normalizada: true,
                normalizada_em: new Date().toISOString(),
                produtos_normalizados: totalItens ?? undefined,
              })
              .eq('id', notaId);
            
            if (updateError) {
              console.error(`❌ Erro ao marcar nota ${notaId}:`, updateError.message);
              notasFalharam++;
            } else {
              console.log(`✅ Nota ${notaId} totalmente decidida — marcada normalizada`);
              notasTotalmenteDecididas++;
            }
          } else {
            // Ainda há órfãos. NÃO incrementar tentativas_normalizacao
            // (evita inflar contador em modo cap onde múltiplos lotes são esperados).
            console.log(`ℹ️ Nota ${notaId} ainda incremental: ${itensOrfaos} órfãos pendentes de IA`);
            notasComOrfaosRestantes++;
          }
          
        } catch (error: any) {
          console.error(`❌ Exceção ao avaliar nota ${notaId}:`, error.message);
          notasFalharam++;
        }
      }
    } else {
      console.log('ℹ️ Nenhuma nota para avaliar');
    }

    const resultado = {
      sucesso: true,
      total_produtos: produtosParaNormalizar.length,
      processados: totalProcessados,
      auto_aprovados: totalAutoAprovados,
      para_revisao: totalParaRevisao,
      notas_processadas: notasIds.length,
      notas_totalmente_decididas: notasTotalmenteDecididas,
      notas_com_orfaos_restantes: notasComOrfaosRestantes,
      notas_falharam: notasFalharam,
      modo: notasComOrfaosRestantes === 0 ? 'COMPLETO' : 'INCREMENTAL',
      modo_teste: MODO_TESTE,
      cap_candidatos: LIMITE_CANDIDATOS,
      candidatos_truncados_por_cap: candidatosTruncados,
      timestamp: new Date().toISOString(),
      debug: {
        modo_teste: MODO_TESTE,
        modo_candidatos_direto: MODO_CANDIDATOS_DIRETO,
        candidato_ids_recebidos: CANDIDATO_IDS,
        produtos_para_normalizar: produtosParaNormalizar.length,
        trace: debugTrace,
      }
    };

    console.log('\n✅ Processamento concluído:', resultado);

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

// ============================================
// NORMALIZAÇÃO AVANÇADA DE TEXTO PARA MATCHING
// ============================================
function normalizarTextoParaMatching(texto: string): string {
  let normalizado = texto.toUpperCase().trim();
  
  // 🔧 PARTE C: Normalizar pontuações e espaços inconsistentes
  normalizado = normalizado
    .replace(/\s*\/\s*/g, '/')       // Normalizar espaços ao redor de / (C/SAL → C/SAL, C/ SAL → C/SAL)
    .replace(/\.(?=[A-Z])/g, '')     // Remover pontos entre letras (S/LAC.ITALAC → S/LACITALAC)
    .replace(/\./g, ' ')             // Pontos restantes viram espaços
    .replace(/,/g, ' ')              // Vírgulas viram espaços
    .replace(/\(/g, ' ')
    .replace(/\)/g, ' ')
    .replace(/\s+/g, ' ')            // Normalizar múltiplos espaços
    .trim();
  
  // Remover sufixos comuns que não afetam identidade do produto
  const sufixosRemover = [
    'UHT',
    'TRADICIONAL',
    'ORIGINAL',
    'REGULAR',
    'CLASSICO',
    'COMUM'
  ];
  
  for (const sufixo of sufixosRemover) {
    const regex = new RegExp(`\\b${sufixo}\\b`, 'gi');
    normalizado = normalizado.replace(regex, '').trim();
  }
  
  // Normalizar espaços novamente após remoções
  normalizado = normalizado.replace(/\s+/g, ' ').trim();
  
  return normalizado;
}

// ============================================
// 🔧 PARTE C: FUZZY MATCHING COM LEVENSHTEIN DISTANCE
// ============================================
function calcularSimilaridadeLevenshtein(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,         // Inserção
        matrix[j - 1][i] + 1,         // Deleção
        matrix[j - 1][i - 1] + substitutionCost  // Substituição
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return ((maxLen - distance) / maxLen) * 100;
}

// ============================================
// EXTRAÇÃO INTELIGENTE DE MARCA DO TEXTO
// ============================================
function extrairMarcaDoTexto(texto: string): string | null {
  const textoUpper = texto.toUpperCase();
  
  // Lista de marcas conhecidas que podem aparecer no meio do texto
  const marcasConhecidas = [
    'ITALAC', 'ROYAL', 'APTI', 'NESTLE', 'DANONE', 'PARMALAT',
    'ITAMBE', 'PIRACANJUBA', 'VIGOR', 'PAULISTA', 'CEMIL',
    'TIROLEZ', 'PRESIDENTE', 'FRIMESA', 'AURORA', 'SADIA',
    'PERDIGAO', 'SEARA', 'BRF', 'JBS', 'MINERVA', 'MARFRIG',
    'CREMINAS', 'CLARAVAL', 'BETANIA', 'SCALA', 'QUATROAMB',
    'UNIAO', 'DA BARRA', 'URBANO', 'CAMIL', 'TIO JOAO',
    'TAEQ', 'QUALITA', 'SANTA AMALIA', 'GRANFINO'
  ];
  
  for (const marca of marcasConhecidas) {
    if (textoUpper.includes(marca)) {
      return marca;
    }
  }
  
  return null;
}

// ============================================
// EXTRAÇÃO DE PESO/VOLUME DO TEXTO
// ============================================
function extrairPesoVolume(texto: string): { valor: number; unidade: string } | null {
  const textoUpper = texto.toUpperCase();
  
  // Padrões comuns de peso/volume
  const padroes = [
    /(\d+(?:\.\d+)?)\s*(KG|KILOS?|K)\b/i,
    /(\d+(?:\.\d+)?)\s*(G|GRAMAS?|GR)\b/i,
    /(\d+(?:\.\d+)?)\s*(L|LITROS?|LT)\b/i,
    /(\d+(?:\.\d+)?)\s*(ML|MILILITROS?)\b/i,
    /(\d+)\s*X\s*(\d+(?:\.\d+)?)\s*(G|ML)/i // Formato "6X200ML"
  ];
  
  for (const padrao of padroes) {
    const match = textoUpper.match(padrao);
    if (match) {
      let valor = parseFloat(match[1]);
      let unidade = match[match.length - 1].toUpperCase();
      
      // Normalizar unidades
      if (unidade === 'KG' || unidade === 'K' || unidade === 'KILOS') {
        valor = valor * 1000;
        unidade = 'G';
      } else if (unidade === 'L' || unidade === 'LT' || unidade === 'LITROS') {
        valor = valor * 1000;
        unidade = 'ML';
      }
      
      return { valor, unidade };
    }
  }
  
  return null;
}

// ============================================
// BUSCA MULTI-CAMADA OTIMIZADA (3 LAYERS)
// ============================================
async function buscarProdutoSimilar(
  supabase: any,
  textoOriginal: string,
  textoNormalizado: string
) {
  // 🔧 NORMALIZAÇÃO AVANÇADA PARA MATCHING MAIS ROBUSTO
  const textoParaMatching = normalizarTextoParaMatching(textoOriginal);
  const marcaExtraida = extrairMarcaDoTexto(textoOriginal);
  const pesoExtraido = extrairPesoVolume(textoOriginal);
  
  console.log(`🔧 Texto normalizado para matching: "${textoParaMatching}"`);
  if (marcaExtraida) console.log(`🏷️  Marca detectada no texto: ${marcaExtraida}`);
  if (pesoExtraido) console.log(`⚖️  Peso/Volume detectado: ${pesoExtraido.valor}${pesoExtraido.unidade}`);
  // CAMADA 1: Busca Exata em Sinônimos (~10ms - resolve 70-80% dos casos)
  console.log('🔍 Camada 1: Buscando em sinônimos...');
  
  // Tentar com texto original e texto normalizado para matching
  const { data: sinonimo } = await supabase
    .from('produtos_sinonimos_globais')
    .select('produto_master_id, produtos_master_global(*)')
    .or(`texto_variacao.ilike.${textoNormalizado},texto_variacao.ilike.${textoParaMatching}`)
    .maybeSingle();
  
  if (sinonimo?.produtos_master_global && (sinonimo.produtos_master_global as any).provisorio !== true) {
    console.log(`✅ Encontrado em sinônimos: ${sinonimo.produtos_master_global.sku_global}`);
    return {
      encontrado: true,
      produto: sinonimo.produtos_master_global,
      metodo: 'sinonimo_exato',
      confianca: 100
    };
  }

  // CAMADA 2: Busca Fuzzy com pg_trgm (~50-200ms - resolve 15-20% dos casos)
  console.log('🔍 Camada 2: Busca fuzzy...');
  
  // Tentar extrair categoria básica do nome (simplificado)
  let categoriaEstimada = 'ALIMENTOS'; // default
  const textoUpper = textoNormalizado.toUpperCase();
  
  if (textoUpper.includes('DETERGENTE') || textoUpper.includes('SABAO') || textoUpper.includes('AMACIANTE')) {
    categoriaEstimada = 'LIMPEZA';
  } else if (textoUpper.includes('REFRIGERANTE') || textoUpper.includes('SUCO') || textoUpper.includes('AGUA')) {
    categoriaEstimada = 'BEBIDAS';
  } else if (textoUpper.includes('SHAMPOO') || textoUpper.includes('SABONETE') || textoUpper.includes('PASTA')) {
    categoriaEstimada = 'HIGIENE';
  }
  
  // Buscar fuzzy por categoria usando RPC (usar texto normalizado para melhor matching)
  const { data: similares } = await supabase.rpc('buscar_produtos_similares', {
    texto_busca: textoParaMatching.split(' ').slice(0, 3).join(' '), // Primeiras 3 palavras normalizadas
    categoria_filtro: categoriaEstimada,
    limite: 10,
    threshold: 0.3
  });

  // 🛡️ Filtra masters provisórios — não devem servir como referência de matching
  const similaresFiltrados = (similares || []).filter((c: any) => !c.provisorio);
  if (similaresFiltrados && similaresFiltrados.length > 0) {
    const melhorMatch = similaresFiltrados[0];
    
    // 🔧 PARTE C + D: Aplicar fuzzy matching com Levenshtein + logs de debugging
    console.log(`\n🔍 ANÁLISE FUZZY DETALHADA:`);
    console.log(`📝 Candidato original: "${textoOriginal}"`);
    console.log(`🔧 Texto normalizado p/ matching: "${textoParaMatching}"`);
    if (marcaExtraida) console.log(`🏷️  Marca detectada: ${marcaExtraida}`);
    if (pesoExtraido) console.log(`⚖️  Peso/Volume detectado: ${pesoExtraido.valor}${pesoExtraido.unidade}`);
    
    // Iterar sobre os candidatos e aplicar Levenshtein
    for (const candidato of similaresFiltrados.slice(0, 5)) { // Top 5 candidatos
      const masterNormalizado = normalizarTextoParaMatching(candidato.nome_padrao);
      const similaridadeLevenshtein = calcularSimilaridadeLevenshtein(textoParaMatching, masterNormalizado);
      
      // Verificar se marca bate (se tiver marca)
      const marcaBate = !marcaExtraida || 
                       !candidato.marca || 
                       candidato.marca.toUpperCase().includes(marcaExtraida) ||
                       marcaExtraida.includes(candidato.marca.toUpperCase());
      
      // Verificar se peso/volume bate (se tiver)
      let pesoBate = true; // Default true se não tiver peso
      if (pesoExtraido && candidato.qtd_valor) {
        const diferencaPeso = Math.abs(candidato.qtd_valor - pesoExtraido.valor);
        pesoBate = diferencaPeso < 10; // Tolerância de 10g/ml
      }
      
      // 🔧 PARTE C: Threshold de 85% quando marca e peso batem (em vez de 90%)
      const thresholdSimilaridade = marcaBate && pesoBate ? 85 : 75;
      
      // 🔍 PARTE D: Logs de debugging detalhados
      console.log(`\n  📊 Candidato: "${candidato.nome_padrao}" [${candidato.sku_global}]`);
      console.log(`     Normalizado: "${masterNormalizado}"`);
      console.log(`     Similaridade Levenshtein: ${similaridadeLevenshtein.toFixed(1)}%`);
      console.log(`     Threshold: ${thresholdSimilaridade}%`);
      console.log(`     Marca bate: ${marcaBate}${candidato.marca ? ` (${candidato.marca})` : ''}`);
      console.log(`     Peso bate: ${pesoBate}${candidato.qtd_valor ? ` (${candidato.qtd_valor}${candidato.qtd_unidade || ''})` : ''}`);
      
      if (similaridadeLevenshtein >= thresholdSimilaridade) {
        console.log(`\n  ✅ MATCH FUZZY ENCONTRADO (${similaridadeLevenshtein.toFixed(1)}% >= ${thresholdSimilaridade}%)`);
        console.log(`     Produto: ${candidato.nome_padrao}`);
        console.log(`     SKU: ${candidato.sku_global}\n`);
        return {
          encontrado: true,
          produto: candidato,
          metodo: 'fuzzy_levenshtein',
          confianca: similaridadeLevenshtein
        };
      }
    }
    
    // Fallback para lógica original (pg_trgm)
    let limiarAceitacao = 0.80; // Padrão: 80%
    
    if (marcaExtraida && pesoExtraido) {
      const matchMarca = melhorMatch.marca?.toUpperCase() === marcaExtraida;
      
      let matchPeso = false;
      if (melhorMatch.qtd_base && melhorMatch.unidade_base) {
        const diferencaPeso = Math.abs(melhorMatch.qtd_base - pesoExtraido.valor) / pesoExtraido.valor;
        matchPeso = diferencaPeso <= 0.10 && melhorMatch.unidade_base.toUpperCase() === pesoExtraido.unidade;
      }
      
      if (matchMarca && matchPeso) {
        limiarAceitacao = 0.70; // Reduzir para 70% quando marca e peso batem
        console.log(`🎯 Marca e peso coincidem - reduzindo limiar para ${limiarAceitacao * 100}%`);
      } else if (matchMarca || matchPeso) {
        limiarAceitacao = 0.75; // 75% se apenas marca OU peso batem
        console.log(`🎯 ${matchMarca ? 'Marca' : 'Peso'} coincide - reduzindo limiar para ${limiarAceitacao * 100}%`);
      }
    }
    
    // Se similaridade > limiar ajustado, considera match forte
    if (melhorMatch.similarity >= limiarAceitacao) {
      console.log(`✅ Match fuzzy forte (pg_trgm): ${melhorMatch.sku_global} (${(melhorMatch.similarity * 100).toFixed(0)}%)`);
      return {
        encontrado: true,
        produto: melhorMatch,
        metodo: 'fuzzy_forte',
        confianca: melhorMatch.similarity * 100
      };
    }

    // Se > 60%, enviar top candidatos para IA decidir
    if (melhorMatch.similarity > 0.6) {
      console.log(`📋 ${similaresFiltrados.length} candidatos fuzzy encontrados para IA avaliar`);
      return {
        encontrado: false,
        candidatos: similaresFiltrados.slice(0, 10),
        metodo: 'fuzzy_candidatos'
      };
    }
  }

  // CAMADA 3: Busca Ampla (fallback - top 50 gerais para IA)
  console.log('🔍 Camada 3: Busca ampla para IA...');
  
  const { data: topGerais } = await supabase
    .from('produtos_master_global')
    .select('*')
    .eq('status', 'ativo')
    .eq('provisorio', false)
    .order('total_usuarios', { ascending: false })
    .limit(50);

  return {
    encontrado: false,
    candidatos: topGerais || [],
    metodo: 'busca_ampla'
  };
}

async function normalizarComIA(
  textoOriginal: string,
  produtosSimilares: any[],
  apiKey: string,
  embalagemInfo?: { isMultiUnit: boolean; quantity: number },
  supabase?: any,
  produto?: ProdutoParaNormalizar,
  timeoutMs: number = 45000
): Promise<NormalizacaoSugerida | null> {
  console.log(`🤖 Analisando com Gemini: "${textoOriginal}"`);

  const promptExtra = embalagemInfo?.isMultiUnit 
    ? `

⚠️ ATENÇÃO ESPECIAL - PRODUTO MULTI-UNIDADE DETECTADO:
- Embalagem original continha ${embalagemInfo.quantity} unidades
- Você DEVE normalizar como PRODUTO UNITÁRIO (1 unidade)
- qtd_valor: 1
- qtd_unidade: "UN"
- qtd_base: 1
- unidade_base: "un"
- categoria_unidade: "UNIDADE"
- granel: false
- Nome deve ser SINGULAR sem número de embalagem
  Exemplo: "OVOS BRANCOS" NÃO "OVOS BRANCOS 30 UN"
`
    : '';

  const prompt = `Você é um especialista em normalização de produtos de supermercado brasileiros.${promptExtra}

PRODUTO PARA NORMALIZAR: "${textoOriginal}"

PRODUTOS SIMILARES NO CATÁLOGO (para referência):
${produtosSimilares.map(p => `- ${p.nome_padrao} | SKU: ${p.sku_global} | ID: ${p.id}`).join('\n') || 'Nenhum produto similar encontrado'}

INSTRUÇÕES:

**🔍 PASSO 1 - VERIFICAR SE É VARIAÇÃO DE PRODUTO EXISTENTE:**

⚠️ CRITÉRIOS RIGOROSOS PARA CONSIDERAR COMO MESMO PRODUTO (usar produto_master_id):

Para usar um produto_master_id existente, TODOS os critérios abaixo devem ser atendidos:

1. ✅ MARCA: Deve ser EXATAMENTE a mesma ou sinônimo direto reconhecido
   - "NINHO" e "LEITE NINHO" ✅ são sinônimos
   - "ROYAL" e "APTI" ❌ são marcas DIFERENTES
   - "CREMINAS" e "ITALAC" ❌ são marcas DIFERENTES

2. ✅ NOME BASE: Deve ser o mesmo produto (permitir apenas variações ortográficas)
   - "CHEIRO VERDE" e "TEMPERO VERDE" ✅ são sinônimos conhecidos
   - "GELATINA" e "GELATINA" ✅ match exato
   - "MANTEIGA" e "MANTEIGA" ✅ match exato
   
3. ✅ ATRIBUTOS CRÍTICOS (quando aplicável) - DEVEM SER IDÊNTICOS:
   - SABOR: Deve ser o mesmo (Framboesa ≠ Morango, Chocolate ≠ Baunilha, Limão ≠ Laranja)
   - COR: Deve ser a mesma (Verde ≠ Azul, Branco ≠ Vermelho)
   - TIPO: Deve ser o mesmo (Integral ≠ Refinado, Com Sal ≠ Sem Sal, Com Lactose ≠ Sem Lactose)
   - CARACTERÍSTICA ESPECIAL: Deve ser a mesma (Light ≠ Normal, Zero ≠ Normal, Diet ≠ Normal)

4. ✅ PESO/VOLUME: Diferença máxima de 10%
   - 1L e 1.05L ✅ (5% de diferença)
   - 25g e 20g ❌ (20% de diferença - criar produto NOVO)
   - 500g e 1kg ❌ (100% de diferença - criar produto NOVO)
   - 200g e 180g ✅ (10% de diferença)

5. ✅ CONFIANÇA MÍNIMA: 95% (NÃO 80% - seja rigoroso!)

🚨 SE QUALQUER UM DESSES CRITÉRIOS FALHAR: Crie um produto NOVO (deixe "produto_master_id": null)

Exemplos de MATCH CORRETO (pode usar produto_master_id):
- "AÇÚCAR CRISTAL UNIÃO 1KG" ← → "ACUCAR CRISTAL UNIAO 1000G" ✅ (mesma marca, mesmo produto, 10% diferença)
- "LEITE NINHO 400G" ← → "LEITE EM PÓ NINHO 400G" ✅ (mesma marca, sinônimo conhecido, mesmo peso)
- "MANTEIGA COM SAL CREMINAS 500G" ← → "MANTEIGA C/ SAL CREMINAS 500G" ✅ (mesma marca, mesmo tipo, mesmo peso)

Exemplos de MATCH INCORRETO (criar produto NOVO - não usar produto_master_id):
- "GELATINA ROYAL FRAMBOESA 25G" ← → "GELATINA APTI MORANGO 20G" ❌ (marca diferente, sabor diferente, peso diferente)
- "MANTEIGA COM SAL 500G" ← → "MANTEIGA SEM SAL 500G" ❌ (atributo crítico diferente)
- "ARROZ INTEGRAL 1KG" ← → "ARROZ BRANCO 1KG" ❌ (tipo diferente)
- "CREME DE LEITE 200G" ← → "CREME DE LEITE SEM LACTOSE 200G" ❌ (atributo crítico diferente)
- "OVO BRANCO 30 UN" ← → "OVO VERMELHO 30 UN" ❌ (cor diferente)

**📝 PASSO 2 - SE NÃO FOR VARIAÇÃO, NORMALIZE COMO PRODUTO NOVO:**
1. Analise o nome do produto e extraia:
   - Nome base (ex: "Arroz", "Feijão", "Leite")
   - Marca (se identificável)
   - Tipo de embalagem (Pacote, Saco, Garrafa, Caixa, etc)
   - Quantidade (valor + unidade, ex: 5 + "kg")
   - Se é granel (vendido por peso/medida)

2. **ATENÇÃO ESPECIAL: UNIDADE BASE**
   - Se a unidade for L (litros): converta para ml (multiplique por 1000)
     Exemplo: 1.25L → qtd_base: 1250, unidade_base: "ml"
   - Se a unidade for kg (quilos): converta para g (multiplique por 1000)
     Exemplo: 0.6kg → qtd_base: 600, unidade_base: "g"
   - Se a unidade já for ml, g, ou unidade: mantenha como está
   - **PÃO FRANCÊS E SIMILARES:** Se não houver quantidade explícita mas o produto é tipicamente vendido por peso (pão francês, frutas, verduras), assuma 1kg = 1000g

3. Categorize a unidade:
   - "VOLUME" para líquidos (ml)
   - "PESO" para sólidos (g)
   - "UNIDADE" para itens vendidos por peça

4. Gere um SKU global único no formato: CATEGORIA-NOME_BASE-MARCA-QTDUNIDADE

5. Categorize em uma dessas categorias OFICIAIS do Picotinho (use EXATAMENTE como escrito):
   AÇOUGUE (com Ç), BEBIDAS, CONGELADOS, HIGIENE/FARMÁCIA, HORTIFRUTI, LATICÍNIOS/FRIOS, LIMPEZA, MERCEARIA, PADARIA, PET, OUTROS
   
   Exemplos por categoria:
   - MERCEARIA: Ketchup, molhos, temperos, massas, arroz, feijão, enlatados, conservas, óleos
   - LATICÍNIOS/FRIOS: Queijos, leite, iogurte, requeijão, manteiga, embutidos, presunto
   - HIGIENE/FARMÁCIA: Produtos de higiene pessoal, cosméticos, remédios, fraldas
   - AÇOUGUE: Carnes, frango, peixe, linguiça (sempre com Ç)
   - BEBIDAS: Refrigerantes, sucos, águas, energéticos, bebidas alcoólicas
   - HORTIFRUTI: Frutas, verduras, legumes
   - LIMPEZA: Produtos de limpeza doméstica
   - CONGELADOS: Alimentos congelados
   - PADARIA: Pães, bolos, tortas
   - PET: Produtos para animais
   - OUTROS: Quando não se encaixa em nenhuma categoria acima

6. Atribua uma confiança de 0-100 baseado em:
   - 90-100: Nome muito claro e estruturado (ou produto encontrado no catálogo)
   - 70-89: Nome razoável mas com alguma ambiguidade
   - 50-69: Nome confuso ou incompleto
   - 0-49: Nome muito vago ou problemático

RESPONDA APENAS COM JSON (sem markdown):
{
  "sku_global": "string",
  "nome_padrao": "string (nome normalizado limpo)",
  "categoria": "string",
  "nome_base": "string",
  "marca": "string ou null",
  "tipo_embalagem": "string ou null",
  "qtd_valor": number ou null,
  "qtd_unidade": "string ou null (L, kg, ml, g, un)",
  "qtd_base": number ou null (sempre em ml/g/unidade),
  "unidade_base": "string ou null (ml, g, un)",
  "categoria_unidade": "string ou null (VOLUME, PESO, UNIDADE)",
  "granel": boolean,
  "confianca": number (0-100),
  "razao": "string (explicação breve - mencione se encontrou no catálogo)",
  "produto_master_id": "string ou null (ID do produto similar encontrado)"
}`;

  try {
    const ia = await chamarIANormalizacao({
      apiKey,
      modelo: 'google/gemini-2.5-flash',
      systemPrompt: 'Você é um especialista em normalização de produtos. Sempre responda com JSON válido, sem markdown.',
      userPrompt: prompt,
      temperature: 0.3,
      timeoutMs,
      supabase,
      texto_original: produto?.texto_original ?? textoOriginal,
      candidato_id: null,
      camposObrigatorios: ['nome_padrao', 'categoria', 'confianca'],
    });

    if (!ia.ok) {
      console.warn(`❌ IA falhou (${ia.tipo_erro}): ${ia.mensagem}`);
      return null;
    }

    const resultado = ia.data;

    // 🔧 VALIDAR E CORRIGIR CATEGORIA (GARANTIR CATEGORIAS OFICIAIS DO PICOTINHO)
    const CATEGORIAS_VALIDAS = [
      'AÇOUGUE', 'BEBIDAS', 'CONGELADOS', 'HIGIENE/FARMÁCIA',
      'HORTIFRUTI', 'LATICÍNIOS/FRIOS', 'LIMPEZA', 'MERCEARIA',
      'PADARIA', 'PET', 'OUTROS'
    ];
    
    const CORRECOES_CATEGORIA: Record<string, string> = {
      'ALIMENTOS': 'MERCEARIA',
      'HIGIENE': 'HIGIENE/FARMÁCIA',
      'FARMACIA': 'HIGIENE/FARMÁCIA',
      'LATICÍNIOS': 'LATICÍNIOS/FRIOS',
      'LATICINIOS': 'LATICÍNIOS/FRIOS',
      'FRIOS': 'LATICÍNIOS/FRIOS',
      'ACOUGUE': 'AÇOUGUE',
      'ASOUGUE': 'AÇOUGUE',
      'CARNES': 'AÇOUGUE'
    };
    
    // Aplicar correção de categoria se necessário
    if (resultado.categoria) {
      const categoriaOriginal = resultado.categoria.toUpperCase();
      
      if (CORRECOES_CATEGORIA[categoriaOriginal]) {
        console.log(`🔧 Corrigindo categoria: ${categoriaOriginal} → ${CORRECOES_CATEGORIA[categoriaOriginal]}`);
        resultado.categoria = CORRECOES_CATEGORIA[categoriaOriginal];
      } else if (!CATEGORIAS_VALIDAS.includes(categoriaOriginal)) {
        console.log(`⚠️ Categoria inválida detectada: ${categoriaOriginal} → OUTROS`);
        resultado.categoria = 'OUTROS';
      } else {
        resultado.categoria = categoriaOriginal;
      }
      
      // Reconstruir SKU com categoria corrigida
      resultado.sku_global = `${resultado.categoria}-${resultado.nome_base.replace(/\s+/g, '_')}-${resultado.marca || 'GENERICO'}-${resultado.qtd_valor}${resultado.qtd_unidade}`;
    }
    
    // 🥚 FORÇAR CORREÇÃO PARA PRODUTOS MULTI-UNIDADE
    if (embalagemInfo?.isMultiUnit) {
      console.log(`🥚 Aplicando correção de multi-unidade para: ${resultado.nome_padrao}`);
      
      resultado.qtd_valor = 1;
      resultado.qtd_unidade = 'UN';
      resultado.qtd_base = 1;
      resultado.unidade_base = 'un';
      resultado.categoria_unidade = 'UNIDADE';
      resultado.granel = false;
      
      // Remover números e "UN" do nome padrao (ex: "OVOS BRANCOS 30 UN" → "OVOS BRANCOS")
      resultado.nome_padrao = resultado.nome_padrao
        .replace(/\bC\/\d+\b/i, '')
        .replace(/\b\d+\s*UN(IDADES)?\b/i, '')
        .replace(/\b\d+\s*OVO(S)?\b/i, '')
        .replace(/\bDZ\d+\b/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      resultado.nome_base = resultado.nome_base
        .replace(/\bC\/\d+\b/i, '')
        .replace(/\b\d+\s*UN(IDADES)?\b/i, '')
        .replace(/\b\d+\s*OVO(S)?\b/i, '')
        .replace(/\bDZ\d+\b/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Atualizar SKU para refletir produto unitário
      resultado.sku_global = `${resultado.categoria}-${resultado.nome_base.replace(/\s+/g, '_')}-${resultado.marca || 'GENERICO'}-1UN`;
      
      console.log(`🥚 Correção aplicada: "${resultado.nome_padrao}" (1 UN)`);
    }
    
    // 🔥 APLICAR UPPERCASE EM TODOS OS CAMPOS DE TEXTO
    resultado.nome_padrao = resultado.nome_padrao?.toUpperCase() || '';
    resultado.nome_base = resultado.nome_base?.toUpperCase() || '';
    resultado.marca = resultado.marca?.toUpperCase() || null;
    resultado.categoria = resultado.categoria?.toUpperCase() || 'OUTROS';

    // 🔥 VALIDAR CAMPOS DE UNIDADE BASE (fallback se IA não calcular)
    if (!resultado.qtd_base && resultado.qtd_valor && resultado.qtd_unidade) {
      const unidadeLower = resultado.qtd_unidade.toLowerCase();
      
      if (unidadeLower === 'l' || unidadeLower === 'litro' || unidadeLower === 'litros') {
        resultado.qtd_base = resultado.qtd_valor * 1000;
        resultado.unidade_base = 'ml';
        resultado.categoria_unidade = 'VOLUME';
      } else if (unidadeLower === 'kg' || unidadeLower === 'kilo' || unidadeLower === 'kilos') {
        resultado.qtd_base = resultado.qtd_valor * 1000;
        resultado.unidade_base = 'g';
        resultado.categoria_unidade = 'PESO';
      } else if (unidadeLower === 'ml') {
        resultado.qtd_base = resultado.qtd_valor;
        resultado.unidade_base = 'ml';
        resultado.categoria_unidade = 'VOLUME';
      } else if (unidadeLower === 'g' || unidadeLower === 'gramas') {
        resultado.qtd_base = resultado.qtd_valor;
        resultado.unidade_base = 'g';
        resultado.categoria_unidade = 'PESO';
      } else {
        resultado.qtd_base = resultado.qtd_valor;
        resultado.unidade_base = 'un';
        resultado.categoria_unidade = 'UNIDADE';
      }
    }
    
    console.log(`✅ IA respondeu com ${resultado.confianca}% de confiança`);
    
    return resultado;

  } catch (error: any) {
    console.error('❌ Erro ao processar resposta da IA:', error);
    try {
      await supabase?.from('ia_normalizacao_erros').insert({
        texto_original: produto?.texto_original ?? textoOriginal,
        tipo_erro: 'desconhecido',
        modelo: 'google/gemini-2.5-flash',
        mensagem: (error?.message || '').slice(0, 2000),
        tentativa: 1,
      });
    } catch (_) {}
    return null;
  }
}

async function criarProdutoMaster(
  supabase: any,
  normalizacao: NormalizacaoSugerida,
  codigoBarras?: string,
  provisorio: boolean = false
): Promise<{ id: string, nome_padrao: string }> {
  // 🛡️ GUARD: Verificar se já existe master com mesmo EAN antes de criar
  // Considera variantes com/sem zeros à esquerda para evitar duplicatas por formatação
  if (codigoBarras) {
    const eanLimpo = codigoBarras.replace(/\D/g, '');
    if (eanLimpo.length >= 8) {
      const eanCanon = eanLimpo.replace(/^0+/, '');
      const variantesEan = new Set<string>([eanCanon]);
      for (const len of [8, 12, 13, 14]) {
        if (eanCanon.length <= len) variantesEan.add(eanCanon.padStart(len, '0'));
      }
      const { data: masterPorEan } = await supabase
        .from('produtos_master_global')
        .select('id, nome_padrao, sku_global')
        .in('codigo_barras', Array.from(variantesEan))
        .eq('status', 'ativo')
        .limit(1)
        .maybeSingle();

      if (masterPorEan) {
        console.log(`🛡️ EAN Guard: master já existe para EAN ${eanLimpo} (canon: ${eanCanon}): ${masterPorEan.nome_padrao} (${masterPorEan.id})`);
        return { id: masterPorEan.id, nome_padrao: masterPorEan.nome_padrao };
      }
    }
  }

  // 🔥 Usar RPC upsert_produto_master para incrementar contadores corretamente
  // Grava sempre na forma canônica (sem zeros à esquerda)
  let codigoBarrasLimpo: string | null = null;
  if (codigoBarras) {
    const eanLimpo = codigoBarras.replace(/\D/g, '');
    if (eanLimpo.length >= 8) {
      codigoBarrasLimpo = eanLimpo.replace(/^0+/, '') || eanLimpo;
    }
  }

  const { data: rpcResult, error } = await supabase.rpc('upsert_produto_master', {
    p_sku_global: normalizacao.sku_global,
    p_nome_padrao: normalizacao.nome_padrao,
    p_nome_base: normalizacao.nome_base,
    p_categoria: normalizacao.categoria,
    p_qtd_valor: normalizacao.qtd_valor,
    p_qtd_unidade: normalizacao.qtd_unidade,
    p_qtd_base: normalizacao.qtd_base,
    p_unidade_base: normalizacao.unidade_base,
    p_categoria_unidade: normalizacao.categoria_unidade,
    p_granel: normalizacao.granel,
    p_marca: normalizacao.marca,
    p_tipo_embalagem: normalizacao.tipo_embalagem,
    p_imagem_url: normalizacao.imagem_url || null,
    p_imagem_path: normalizacao.imagem_path || null,
    p_confianca: normalizacao.confianca,
    p_codigo_barras: codigoBarrasLimpo,
    p_provisorio: provisorio
  });

  if (error) {
    throw new Error(`Erro ao criar/atualizar produto master: ${error.message}`);
  }
  
  const masterId = rpcResult?.id;
  const operacao = rpcResult?.operacao || 'UNKNOWN';
  console.log(`✅ Produto master ${operacao}: ${normalizacao.nome_padrao} (ID: ${masterId})`);
  return { id: masterId, nome_padrao: normalizacao.nome_padrao };
}

async function criarCandidato(
  supabase: any,
  produto: ProdutoParaNormalizar,
  normalizacao: NormalizacaoSugerida,
  status: string,
  obsEmbalagem?: string | null,
  extras?: { motivo_bloqueio?: string | null; candidatos_proximos?: any[] | null }
) {
  const motivoBloqueio = extras?.motivo_bloqueio ?? null;
  const candidatosProximos = extras?.candidatos_proximos ?? null;
  // ✅ CORREÇÃO 1: Buscar candidato existente ANTES de criar (SEM filtrar por status)
  const { data: candidatoExistente } = await supabase
    .from('produtos_candidatos_normalizacao')
    .select('id, status')
    .eq('nota_imagem_id', produto.nota_imagem_id)
    .eq('texto_original', produto.texto_original)
    .maybeSingle();

  if (candidatoExistente) {
    // ✅ REPROCESSAR candidatos órfãos (notas excluídas e reinseridas)
    if (['auto_aprovado', 'rejeitado'].includes(candidatoExistente.status)) {
      console.warn(`⚠️ Candidato órfão detectado (${candidatoExistente.status}): ${produto.texto_original}`);
      console.warn(`⚠️ Nota ${produto.nota_imagem_id} pode ter sido excluída e reinserida`);
      console.log(`🔄 Reprocessando candidato órfão: ${produto.texto_original}`);
      
      // Reprocessar candidato órfão
      const { error: updateError } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({
          sugestao_sku_global: normalizacao.sku_global,
          sugestao_produto_master: normalizacao.produto_master_id,
          confianca_ia: normalizacao.confianca,
          razao_ia: normalizacao.razao,
          nome_padrao_sugerido: normalizacao.nome_padrao,
          categoria_sugerida: normalizacao.categoria,
          nome_base_sugerido: normalizacao.nome_base,
          marca_sugerida: normalizacao.marca,
          tipo_embalagem_sugerido: normalizacao.tipo_embalagem,
          qtd_valor_sugerido: normalizacao.qtd_valor,
          qtd_unidade_sugerido: normalizacao.qtd_unidade,
          qtd_base_sugerida: normalizacao.qtd_base,
          unidade_base_sugerida: normalizacao.unidade_base,
          categoria_unidade_sugerida: normalizacao.categoria_unidade,
          granel_sugerido: normalizacao.granel,
          // ⚡ PARTE A: REMOVIDO colunas que não existem (obs_embalagem_sugerida, dados_extraidos)
          status: status,
          precisa_ia: false, // ✅ Fase 1: IA já preencheu
          motivo_bloqueio: motivoBloqueio,
          candidatos_proximos: candidatosProximos,
          updated_at: new Date().toISOString()
        })
        .eq('id', candidatoExistente.id);
      
      if (updateError) {
        console.error(`❌ Erro ao reprocessar candidato órfão: ${updateError.message}`);
        throw new Error(`Erro ao reprocessar candidato órfão: ${updateError.message}`);
      }
      
      console.log(`✅ Candidato órfão reprocessado: ${candidatoExistente.id}`);
      
      // O estoque será atualizado automaticamente pelo trigger trg_sync_candidato
      if (status === 'auto_aprovado' && normalizacao.produto_master_id) {
        console.log(`✅ Candidato órfão auto-aprovado - estoque sincronizado via trigger`);
      }
      
      return;
    }
    
    // ✏️ ATUALIZAR apenas candidatos pendentes
    console.log(`🔄 Atualizando candidato pendente: ${produto.texto_original}`);
    
    const { error } = await supabase
      .from('produtos_candidatos_normalizacao')
      .update({
        sugestao_sku_global: normalizacao.sku_global,
        sugestao_produto_master: normalizacao.produto_master_id,
        confianca_ia: normalizacao.confianca,
        nome_padrao_sugerido: normalizacao.nome_padrao,
        categoria_sugerida: normalizacao.categoria,
        nome_base_sugerido: normalizacao.nome_base,
        marca_sugerida: normalizacao.marca,
        tipo_embalagem_sugerido: normalizacao.tipo_embalagem,
        qtd_valor_sugerido: normalizacao.qtd_valor,
        qtd_unidade_sugerido: normalizacao.qtd_unidade,
        qtd_base_sugerida: normalizacao.qtd_base,
        unidade_base_sugerida: normalizacao.unidade_base,
        categoria_unidade_sugerida: normalizacao.categoria_unidade,
        granel_sugerido: normalizacao.granel,
        razao_ia: normalizacao.razao,
        status: status, // Mudar de 'pendente' para terminal (auto_aprovado | pendente_revisao)
        precisa_ia: false, // ✅ Fase 1: IA já preencheu
        motivo_bloqueio: motivoBloqueio,
        candidatos_proximos: candidatosProximos,
        observacoes_revisor: obsEmbalagem || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', candidatoExistente.id)
      .eq('status', 'pendente'); // 🔒 invariante: nunca reabrir auto_aprovado/aprovado/rejeitado/pendente_revisao

    if (error) {
      throw new Error(`Erro ao atualizar candidato: ${error.message}`);
    }
    
    console.log(`✅ Candidato atualizado: ${candidatoExistente.id} → status: ${status}`);
    
  } else {
    // 📝 Criar novo candidato (lógica original)
    console.log(`📝 Criando novo candidato: ${produto.texto_original}`);
    
    const { error } = await supabase
      .from('produtos_candidatos_normalizacao')
      .insert({
        texto_original: produto.texto_original,
        usuario_id: produto.usuario_id || null,
        nota_imagem_id: produto.nota_imagem_id || null,
        nota_item_hash: produto.nota_item_hash || null,
        sugestao_sku_global: normalizacao.sku_global,
        sugestao_produto_master: normalizacao.produto_master_id,
        confianca_ia: normalizacao.confianca,
        nome_padrao_sugerido: normalizacao.nome_padrao,
        categoria_sugerida: normalizacao.categoria,
        nome_base_sugerido: normalizacao.nome_base,
        marca_sugerida: normalizacao.marca,
        tipo_embalagem_sugerido: normalizacao.tipo_embalagem,
        qtd_valor_sugerido: normalizacao.qtd_valor,
        qtd_unidade_sugerido: normalizacao.qtd_unidade,
        qtd_base_sugerida: normalizacao.qtd_base,
        unidade_base_sugerida: normalizacao.unidade_base,
        categoria_unidade_sugerida: normalizacao.categoria_unidade,
        granel_sugerido: normalizacao.granel,
        razao_ia: normalizacao.razao,
        status: status,
        motivo_bloqueio: motivoBloqueio,
        candidatos_proximos: candidatosProximos,
        precisa_ia: motivoBloqueio ? false : undefined,
        observacoes_revisor: obsEmbalagem || null
      });

    if (error) {
      throw new Error(`Erro ao criar candidato: ${error.message}`);
    }
    
    console.log(`✅ Candidato criado com status: ${status}`);
  }

  // ✅ CORREÇÃO 2: Atualizar estoque_app automaticamente se candidato foi auto-aprovado
  if (status === 'auto_aprovado' && normalizacao.produto_master_id && produto.nota_imagem_id) {
    console.log(`🔗 Vinculando produto ao master no estoque_app: ${produto.texto_original}`);
    
    // Buscar detalhes completos do master para atualizar estoque
    const { data: masterDetails, error: masterError } = await supabase
      .from('produtos_master_global')
      .select('imagem_url, nome_padrao, marca, nome_base, categoria')
      .eq('id', normalizacao.produto_master_id)
      .single();
    
    if (masterError) {
      console.error(`⚠️ Erro ao buscar master: ${masterError.message}`);
    }
    
    // Preparar dados para atualização completa
    const updateData: any = {
      produto_master_id: normalizacao.produto_master_id,
      sku_global: normalizacao.sku_global,
      updated_at: new Date().toISOString()
    };
    
    // Adicionar campos do master se disponíveis
    if (masterDetails) {
      updateData.produto_nome = masterDetails.nome_padrao;
      updateData.produto_nome_normalizado = masterDetails.nome_padrao;
      updateData.nome_base = masterDetails.nome_base;
      updateData.marca = masterDetails.marca;
      updateData.categoria = masterDetails.categoria?.toLowerCase() || normalizacao.categoria?.toLowerCase();
      
      // Atualizar imagem se master tiver
      if (masterDetails.imagem_url) {
        updateData.imagem_url = masterDetails.imagem_url;
      }
    }
    
    const { error: estoqueError, count } = await supabase
      .from('estoque_app')
      .update(updateData)
      .eq('produto_candidato_id', candidatoData.id) // ✅ FK direta - mais confiável que match de string
      .is('produto_master_id', null); // Só atualizar quem ainda não tem master
    
    if (estoqueError) {
      console.error(`⚠️ Erro ao atualizar estoque_app: ${estoqueError.message}`);
    } else {
      console.log(`✅ Estoque atualizado completamente: ${produto.texto_original} → ${normalizacao.nome_padrao || normalizacao.sku_global}`);
      if (masterDetails?.imagem_url) {
        console.log(`📸 Imagem do master vinculada: ${masterDetails.imagem_url}`);
      }
    }
  }
}