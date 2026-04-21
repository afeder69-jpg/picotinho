import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🚀 COMPARAR-PRECOS-LISTA V4.0 - master priorizado por preços + fallback conservador');

  try {
    const authHeader = req.headers.get('Authorization')!;
    
    // Usar Service Role Key quando chamado de outra edge function
    const supabaseKey = authHeader?.includes('service_role') 
      ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      : Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      supabaseKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Client admin para consultas em precos_atuais (ignora RLS, mesma visibilidade da consulta individual)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { userId, listaId } = await req.json();
    
    if (!userId || !listaId) {
      throw new Error('userId e listaId são obrigatórios');
    }

    console.log(`📍 Iniciando comparação para usuário: ${userId}`);

    // Buscar configuração do usuário
    const { data: config } = await supabase
      .from('configuracoes_usuario')
      .select('raio_busca_km')
      .eq('usuario_id', userId)
      .single();

    const raioBusca = config?.raio_busca_km || 5;
    console.log(`📍 Raio de busca: ${raioBusca}km`);

    // Buscar localização do perfil do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .single();

    if (!profile?.latitude || !profile?.longitude) {
      console.log('❌ Usuário sem localização cadastrada no perfil');
      
      // Buscar itens para retornar na resposta
      const { data: itens } = await supabase
        .from('listas_compras_itens')
        .select('*')
        .eq('lista_id', listaId);

      return new Response(
        JSON.stringify({
          otimizado: { total: 0, economia: 0, percentualEconomia: 0, totalMercados: 0, mercados: [] },
          comparacao: {},
          produtosSemPreco: itens || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📍 Localização do usuário: ${profile.latitude}, ${profile.longitude}`);

    // Usar a Edge Function existente que já funciona corretamente
    const { data: resultadoMercados, error: mercadosError } = await supabase.functions.invoke(
      'buscar-supermercados-area',
      {
        body: {
          latitude: profile.latitude,
          longitude: profile.longitude,
          raio: raioBusca,
          userId: userId
        }
      }
    );

    if (mercadosError || !resultadoMercados?.success) {
      console.log('❌ Erro ao buscar mercados:', mercadosError);
      
      // Buscar itens para retornar na resposta
      const { data: itens } = await supabase
        .from('listas_compras_itens')
        .select('*')
        .eq('lista_id', listaId);

      return new Response(
        JSON.stringify({
          otimizado: { total: 0, economia: 0, percentualEconomia: 0, totalMercados: 0, mercados: [] },
          comparacao: {},
          produtosSemPreco: itens || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mercados = (resultadoMercados.supermercados || []).slice(0, 15);
    console.log(`✅ ${mercados.length} mercados encontrados para comparação`);

    // Buscar itens da lista
    const { data: itens, error: itensError } = await supabase
      .from('listas_compras_itens')
      .select('*')
      .eq('lista_id', listaId);

    if (itensError) throw itensError;

    // Se não houver mercados, retornar estrutura vazia
    if (mercados.length === 0) {
      return new Response(
        JSON.stringify({
          otimizado: { total: 0, economia: 0, percentualEconomia: 0, totalMercados: 0, mercados: [] },
          comparacao: {},
          produtosSemPreco: itens
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Função auxiliar para busca inteligente de produtos com estratégia OR
    const buscarPrecoInteligente = async (
      userId: string,
      produtoNome: string,
      estabelecimentoNome?: string,
      produtoMasterId?: string,
      cnpjMercado?: string,
      masterResolvidoPorNome?: boolean
    ): Promise<{ valor: number; data_atualizacao: string } | null> => {
      console.log(`  🔍 Buscando preço para: "${produtoNome}" (master_id: ${produtoMasterId || 'N/A'}, cnpj: ${cnpjMercado || 'N/A'})`);

      // ========================================
      // PASSO 0: Busca estrutural por produto_master_id + CNPJ do mercado
      // Mesma lógica da Consulta de Preços — garante consistência entre módulos
      // ========================================
      if (produtoMasterId && cnpjMercado) {
        const { data: precoMaster } = await supabaseAdmin
          .from('precos_atuais')
          .select('valor_unitario, produto_nome, data_atualizacao')
          .eq('produto_master_id', produtoMasterId)
          .eq('estabelecimento_cnpj', cnpjMercado)
          .order('data_atualizacao', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (precoMaster?.valor_unitario) {
          console.log(`  ✅ [MASTER-ID+CNPJ] R$ ${precoMaster.valor_unitario} - "${precoMaster.produto_nome}"`);
          return { valor: precoMaster.valor_unitario, data_atualizacao: precoMaster.data_atualizacao };
        }

        // Fallback conservador: busca EXATA por nome no mesmo CNPJ
        const { data: precoNomeExato } = await supabaseAdmin
          .from('precos_atuais')
          .select('valor_unitario, produto_nome, data_atualizacao')
          .eq('estabelecimento_cnpj', cnpjMercado)
          .ilike('produto_nome', produtoNome.trim())
          .order('data_atualizacao', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (precoNomeExato?.valor_unitario) {
          console.log(`  ✅ [FALLBACK-NOME-EXATO] R$ ${precoNomeExato.valor_unitario} - "${precoNomeExato.produto_nome}" @ CNPJ ${cnpjMercado}`);
          return { valor: precoNomeExato.valor_unitario, data_atualizacao: precoNomeExato.data_atualizacao };
        }

        // NOVO FALLBACK: buscar pelo nome_padrao do master (pode diferir do nome do item na lista)
        if (produtoMasterId) {
          const { data: masterInfo } = await supabaseAdmin
            .from('produtos_master_global')
            .select('nome_padrao')
            .eq('id', produtoMasterId)
            .maybeSingle();

          if (masterInfo?.nome_padrao && masterInfo.nome_padrao.trim().toLowerCase() !== produtoNome.trim().toLowerCase()) {
            const { data: precoViaMaster } = await supabaseAdmin
              .from('precos_atuais')
              .select('valor_unitario, produto_nome, data_atualizacao')
              .eq('estabelecimento_cnpj', cnpjMercado)
              .ilike('produto_nome', masterInfo.nome_padrao.trim())
              .order('data_atualizacao', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (precoViaMaster?.valor_unitario) {
              console.log(`  ✅ [FALLBACK-NOME-MASTER] R$ ${precoViaMaster.valor_unitario} - "${precoViaMaster.produto_nome}" (master: "${masterInfo.nome_padrao}") @ CNPJ ${cnpjMercado}`);
              return { valor: precoViaMaster.valor_unitario, data_atualizacao: precoViaMaster.data_atualizacao };
            }
          }
        }

        // Se veio de vínculo original (não resolvido por nome), parar aqui
        if (!masterResolvidoPorNome) {
          console.log(`  ❌ [MASTER-ID] Sem preço neste mercado (${cnpjMercado}) — vínculo original, sem fallback`);
          return null;
        }

        console.log(`  ❌ [MASTER-ID] Sem preço neste mercado (${cnpjMercado}) — fallback por nome também não encontrou`);
        return null;
      }

      // ========================================
      // FALLBACK: Busca fuzzy para itens SEM produto_id (itens antigos/manuais)
      // ========================================
      const produtoUpper = produtoNome.toUpperCase().trim();
      
      // Extrair palavras-chave relevantes (>2 letras, sem números puros)
      const palavrasChave = produtoUpper
        .split(/\s+/)
        .filter(palavra => palavra.length > 2 && !/^\d+$/.test(palavra))
        .slice(0, 4);
      
      console.log(`  📝 [FALLBACK] Palavras-chave: [${palavrasChave.join(', ')}]`);
      
      // 1. Busca exata em precos_atuais_usuario
      const { data: precoUsuarioExato } = await supabase
        .from('precos_atuais_usuario')
        .select('valor_unitario, produto_nome, data_atualizacao')
        .eq('user_id', userId)
        .ilike('produto_nome', produtoUpper)
        .order('data_atualizacao', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (precoUsuarioExato?.valor_unitario) {
        console.log(`  ✅ [USUÁRIO-EXATO] R$ ${precoUsuarioExato.valor_unitario} - "${precoUsuarioExato.produto_nome}"`);
        return { valor: precoUsuarioExato.valor_unitario, data_atualizacao: precoUsuarioExato.data_atualizacao };
      }
      
      // 2. Busca com 2 palavras principais em precos_atuais_usuario (estratégia OR)
      if (palavrasChave.length >= 2) {
        const palavra1 = palavrasChave[0];
        const palavra2 = palavrasChave[1];
        
        const { data: precosUsuarioOr } = await supabase
          .from('precos_atuais_usuario')
          .select('valor_unitario, produto_nome, data_atualizacao')
          .eq('user_id', userId)
          .or(`produto_nome.ilike.%${palavra1}%,produto_nome.ilike.%${palavra2}%`)
          .order('data_atualizacao', { ascending: false })
          .limit(5);
        
        if (precosUsuarioOr && precosUsuarioOr.length > 0) {
          const scored = precosUsuarioOr.map(p => ({
            ...p,
            score: palavrasChave.filter(palavra => 
              p.produto_nome.toUpperCase().includes(palavra)
            ).length
          })).sort((a, b) => b.score - a.score);
          
          const melhor = scored[0];
          console.log(`  ✅ [USUÁRIO-OR] R$ ${melhor.valor_unitario} - "${melhor.produto_nome}" (${melhor.score}/${palavrasChave.length} palavras)`);
          return { valor: melhor.valor_unitario, data_atualizacao: melhor.data_atualizacao };
        }
      }
      
      // 3. Busca exata em precos_atuais (com estabelecimento e user_id)
      if (estabelecimentoNome && cnpjMercado) {
        const { data: precoGeralExato } = await supabaseAdmin
          .from('precos_atuais')
          .select('valor_unitario, produto_nome, estabelecimento_nome, data_atualizacao')
          .eq('estabelecimento_cnpj', cnpjMercado)
          .ilike('produto_nome', produtoUpper)
          .order('data_atualizacao', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (precoGeralExato?.valor_unitario) {
          console.log(`  ✅ [GERAL-EXATO] R$ ${precoGeralExato.valor_unitario} - "${precoGeralExato.produto_nome}" @ ${precoGeralExato.estabelecimento_nome}`);
          return { valor: precoGeralExato.valor_unitario, data_atualizacao: precoGeralExato.data_atualizacao };
        }
        
        // 4. Busca com 2 palavras principais em precos_atuais (estratégia OR filtrada por CNPJ)
        if (palavrasChave.length >= 2) {
          const palavra1 = palavrasChave[0];
          const palavra2 = palavrasChave[1];
          
          const { data: precosGeralOr } = await supabaseAdmin
            .from('precos_atuais')
            .select('valor_unitario, produto_nome, estabelecimento_nome, data_atualizacao')
            .eq('estabelecimento_cnpj', cnpjMercado)
            .or(`produto_nome.ilike.%${palavra1}%,produto_nome.ilike.%${palavra2}%`)
            .order('data_atualizacao', { ascending: false })
            .limit(5);
          
          if (precosGeralOr && precosGeralOr.length > 0) {
            const scored = precosGeralOr.map(p => ({
              ...p,
              score: palavrasChave.filter(palavra => 
                p.produto_nome.toUpperCase().includes(palavra)
              ).length
            })).sort((a, b) => b.score - a.score);
            
            const melhor = scored[0];
            console.log(`  ✅ [GERAL-OR] R$ ${melhor.valor_unitario} - "${melhor.produto_nome}" @ ${melhor.estabelecimento_nome} (${melhor.score}/${palavrasChave.length} palavras)`);
            return { valor: melhor.valor_unitario, data_atualizacao: melhor.data_atualizacao };
          }
        }
      }
      
      console.log(`  ❌ Nenhum preço encontrado`);
      return null;
    };

    // Buscar preços para cada produto em cada mercado
    const precosPromises = itens.map(async (item) => {
      // Itens livres não participam da comparação de preços
      if (item.item_livre === true) {
        console.log(`⏭️ Item livre ignorado na comparação: ${item.produto_nome}`);
        return { item, precos: new Map() };
      }

      console.log(`\n🔍 Buscando preços para: ${item.produto_nome}`);
      console.log(`📦 Quantidade: ${item.quantidade} ${item.unidade_medida}`);
      
      // Resolver produto_master_id se o item não tem vínculo
      let produtoMasterId = item.produto_id || null;
      let masterResolvidoPorNome = false;
      if (!produtoMasterId) {
        const { data: masters } = await supabaseAdmin
          .from('produtos_master_global')
          .select('id')
          .ilike('nome_padrao', item.produto_nome.trim())
          .limit(5);
        if (masters && masters.length > 0) {
          // Preferir master que realmente tem preços vinculados
          for (const m of masters) {
            const { count } = await supabaseAdmin
              .from('precos_atuais')
              .select('id', { count: 'exact', head: true })
              .eq('produto_master_id', m.id)
              .limit(1);
            if (count && count > 0) {
              produtoMasterId = m.id;
              console.log(`  🔗 Master resolvido (com preços): ${produtoMasterId}`);
              break;
            }
          }
          if (!produtoMasterId) {
            produtoMasterId = masters[0].id;
            console.log(`  🔗 Master resolvido (sem preços, fallback): ${produtoMasterId}`);
          }
          masterResolvidoPorNome = true;
        } else {
          console.log(`  ⚠️ Sem master_id para: ${item.produto_nome}`);
        }
      }

      const precosMap = new Map();

      // PROTEÇÃO ANTI-FALSO-POSITIVO (Fase 1):
      // Pendente real (sem master e sem master resolvido por nome) NÃO participa
      // de comparação cruzada entre mercados. Vai direto para "produtosSemPreco"
      // e exibirá apenas o histórico restrito ao próprio usuário.
      if (!produtoMasterId) {
        console.log(`  🛡️ Pendente sem master — fora da comparação cruzada (apenas histórico do usuário)`);
        return { item, precos: precosMap };
      }

      for (const mercado of mercados) {
        const nomeNormalizado = mercado.nome?.toUpperCase().trim() || '';
        console.log(`\n🏪 Mercado: ${nomeNormalizado}`);
        
        const resultado = await buscarPrecoInteligente(
          userId,
          item.produto_nome,
          nomeNormalizado,
          produtoMasterId || undefined,
          mercado.cnpj || undefined,
          masterResolvidoPorNome
        );
        
        if (resultado) {
          precosMap.set(mercado.id, resultado);
        } else {
          console.log(`  ❌ Nenhum preço encontrado`);
        }
      }

      return {
        item,
        precos: precosMap
      };
    });

    const precosData = await Promise.all(precosPromises);

    // Calcular cenários
    const produtosSemPreco: any[] = [];

    // ===== Helpers de tokenização (Fase 1.1) =====
    const normalizarTexto = (s: string): string =>
      (s || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Tokens de variante: se aparecem no item mas não no candidato (ou vice-versa), é falso positivo.
    // Reaproveita lógica da memória `product-variant-keyword-validation`.
    const TOKENS_VARIANTE = new Set([
      'ZERO', 'DIET', 'LIGHT', 'INTEGRAL', 'DESNATADO', 'SEMIDESNATADO',
      'INTEGRA', 'ORGANICO', 'ORGANICA',
      'MULTIUSO', 'BACTERICIDA', 'NEUTRO', 'NEUTRA',
      'AMACIANTE', 'CONCENTRADO',
      'COCA', 'GUARANA', 'UVA', 'LARANJA', 'LIMAO', 'MORANGO', 'CHOCOLATE',
      'BAUNILHA', 'COCO', 'AMENDOIM', 'MENTA',
      'PERU', 'FRANGO', 'BOVINO', 'SUINO', 'PEIXE',
      'ACO', 'INOX', 'PLASTICO', 'VIDRO',
      'ROSE', 'ROSA', 'BRANCO', 'TINTO',
      'CALABRESA', 'PORTUGUESA', 'MUSSARELA', 'MARGUERITA',
      'PARBOILIZADO', 'AGULHINHA', 'ARBORIO',
      'EXTRAFORTE', 'TRADICIONAL_CAFE',
    ]);

    // Tokens neutros — não bloqueiam match mesmo se ausentes do outro lado
    const TOKENS_NEUTROS = new Set([
      'SEMOLA', 'TRADICIONAL', 'CLASSICO', 'CLASSICA', 'NORMAL',
      'TIPO', 'PCT', 'PACOTE', 'EMBALAGEM', 'UNIDADE', 'UN', 'UND',
      'KG', 'G', 'GR', 'ML', 'L', 'LT', 'LITRO',
    ]);

    const tokenizar = (s: string): string[] => {
      const norm = normalizarTexto(s);
      return norm
        .split(' ')
        .filter(t => t.length > 2 && !/^\d+$/.test(t));
    };

    // Token-cover com lock de variante
    // Retorna { score, ok } — score = tokens compartilhados; ok = passou nos critérios
    const calcularMatch = (
      tokensItem: string[],
      tokensCandidato: string[]
    ): { score: number; ok: boolean } => {
      if (tokensItem.length === 0 || tokensCandidato.length === 0) {
        return { score: 0, ok: false };
      }

      const setItem = new Set(tokensItem);
      const setCand = new Set(tokensCandidato);

      // Lock de variante: se item tem token de variante ausente no candidato, rejeita
      for (const t of setItem) {
        if (TOKENS_VARIANTE.has(t) && !setCand.has(t)) {
          return { score: 0, ok: false };
        }
      }
      for (const t of setCand) {
        if (TOKENS_VARIANTE.has(t) && !setItem.has(t)) {
          return { score: 0, ok: false };
        }
      }

      // Tokens significativos do item (excluindo neutros) para cálculo de cobertura
      const tokensItemSig = tokensItem.filter(t => !TOKENS_NEUTROS.has(t));
      const baseCobertura = tokensItemSig.length > 0 ? tokensItemSig : tokensItem;

      const intersecao = baseCobertura.filter(t => setCand.has(t));
      const score = intersecao.length;
      const cobertura = score / baseCobertura.length;

      // Aceita se cobertura ≥ 80% OU se ≥ 3 tokens significativos baterem
      const ok = cobertura >= 0.8 || score >= 3;
      return { score, ok };
    };

    // Helper: buscar último preço conhecido (fallback histórico) para item sem preço atual na área
    // Para PENDENTES (sem master), restringe ao próprio usuário e enriquece com estabelecimento da nota mais recente.
    const buscarUltimoPrecoConhecido = async (item: any, masterId: string | null) => {
      try {
        // 1. Se houver master, buscar em precos_atuais (qualquer estabelecimento)
        if (masterId) {
          const { data } = await supabaseAdmin
            .from('precos_atuais')
            .select('valor_unitario, data_atualizacao, estabelecimento_nome, estabelecimento_cnpj')
            .eq('produto_master_id', masterId)
            .order('data_atualizacao', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data?.valor_unitario) {
            return {
              valor_unitario: Number(data.valor_unitario),
              data_atualizacao: data.data_atualizacao,
              estabelecimento_nome: data.estabelecimento_nome || null,
              estabelecimento_cnpj: data.estabelecimento_cnpj || null,
            };
          }
          console.log(`  🔎 [HIST] Master ${masterId} sem precos_atuais — caindo para estoque do usuário`);
        }

        const nome = (item.produto_nome || '').trim();
        if (!nome) return null;

        const tokensItem = tokenizar(nome);
        if (tokensItem.length === 0) return null;

        // 1.5 Master IRMÃO: se o master da lista é uma duplicata órfã, tentar achar
        // o master "irmão" no estoque do usuário via token-cover e tentar precos_atuais com ele.
        if (masterId) {
          try {
            const { data: estoqueIrmaos } = await supabaseAdmin
              .from('estoque_app')
              .select('produto_nome, produto_master_id, updated_at')
              .eq('user_id', userId)
              .not('produto_master_id', 'is', null)
              .neq('produto_master_id', masterId)
              .order('updated_at', { ascending: false })
              .limit(50);

            if (estoqueIrmaos && estoqueIrmaos.length > 0) {
              const candidatosIrmaos = estoqueIrmaos
                .map(row => {
                  const tokensC = tokenizar(row.produto_nome || '');
                  const { score, ok } = calcularMatch(tokensItem, tokensC);
                  return { row, score, ok };
                })
                .filter(c => c.ok)
                .sort((a, b) => b.score - a.score);

              const mastersTentados = new Set<string>();
              for (const cand of candidatosIrmaos) {
                const irmaoId = cand.row.produto_master_id as string;
                if (!irmaoId || mastersTentados.has(irmaoId)) continue;
                mastersTentados.add(irmaoId);

                const { data: precoIrmao } = await supabaseAdmin
                  .from('precos_atuais')
                  .select('valor_unitario, data_atualizacao, estabelecimento_nome, estabelecimento_cnpj')
                  .eq('produto_master_id', irmaoId)
                  .order('data_atualizacao', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (precoIrmao?.valor_unitario) {
                  console.log(`  🤝 [HIST-IRMAO] "${item.produto_nome}" via master irmão ${irmaoId} (lista=${masterId}) ← "${cand.row.produto_nome}" R$ ${precoIrmao.valor_unitario}`);
                  return {
                    valor_unitario: Number(precoIrmao.valor_unitario),
                    data_atualizacao: precoIrmao.data_atualizacao,
                    estabelecimento_nome: precoIrmao.estabelecimento_nome || null,
                    estabelecimento_cnpj: precoIrmao.estabelecimento_cnpj || null,
                  };
                }
                if (mastersTentados.size >= 3) break; // limita tentativas
              }
            }
          } catch (errIrmao) {
            console.warn('  ⚠️ Falha ao buscar master irmão:', errIrmao);
          }
        }

        // 2. Estoque do próprio usuário (PENDENTES + fallback) — token-cover dirigido por tokens fortes
        // Usar OR por tokens significativos do item para garantir que candidatos relevantes
        // entrem na amostra, mesmo em usuários com centenas de registros.
        const tokensFortes = tokensItem
          .filter(t => !TOKENS_NEUTROS.has(t) && !TOKENS_VARIANTE.has(t))
          .slice(0, 4);
        const tokensBusca = tokensFortes.length > 0 ? tokensFortes : tokensItem.slice(0, 4);
        const orFiltroEstoque = tokensBusca.map(t => `produto_nome.ilike.%${t}%`).join(',');

        let estoqueRows: any[] | null = null;
        if (orFiltroEstoque) {
          const { data: estoqueDirigido } = await supabaseAdmin
            .from('estoque_app')
            .select('produto_nome, preco_unitario_ultimo, updated_at, nota_id')
            .eq('user_id', userId)
            .not('preco_unitario_ultimo', 'is', null)
            .or(orFiltroEstoque)
            .order('updated_at', { ascending: false })
            .limit(200);
          estoqueRows = estoqueDirigido || null;
        }
        // Fallback: se a busca dirigida não trouxe nada, manter a janela ampla anterior
        if (!estoqueRows || estoqueRows.length === 0) {
          const { data: estoqueAmplo } = await supabaseAdmin
            .from('estoque_app')
            .select('produto_nome, preco_unitario_ultimo, updated_at, nota_id')
            .eq('user_id', userId)
            .not('preco_unitario_ultimo', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(200);
          estoqueRows = estoqueAmplo || null;
        }
        console.log(`  📊 [HIST-CANDIDATOS] estoque_app: ${estoqueRows?.length || 0} candidatos (tokens=[${tokensBusca.join(', ')}])`);

        if (estoqueRows && estoqueRows.length > 0) {
          const candidatos = estoqueRows
            .map(row => {
              const tokensC = tokenizar(row.produto_nome || '');
              const { score, ok } = calcularMatch(tokensItem, tokensC);
              return { row, score, ok };
            })
            .filter(c => c.ok)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return new Date(b.row.updated_at).getTime() - new Date(a.row.updated_at).getTime();
            });

          if (candidatos.length > 0) {
            const melhor = candidatos[0].row;
            let estabelecimentoNome: string | null = null;
            let estabelecimentoCnpj: string | null = null;
            if (melhor.nota_id) {
              const { data: notaRow } = await supabaseAdmin
                .from('notas_imagens')
                .select('dados_extraidos')
                .eq('id', melhor.nota_id)
                .maybeSingle();
              const dados: any = notaRow?.dados_extraidos || {};
              estabelecimentoNome =
                dados?.estabelecimento?.nome ||
                dados?.emitente?.nome ||
                dados?.mercado?.nome ||
                dados?.supermercado ||
                null;
              estabelecimentoCnpj =
                dados?.estabelecimento?.cnpj ||
                dados?.emitente?.cnpj ||
                dados?.cnpj ||
                null;
            }
            console.log(`  📜 [HIST-ESTOQUE] "${item.produto_nome}" ← "${melhor.produto_nome}" R$ ${melhor.preco_unitario_ultimo} @ ${estabelecimentoNome || '?'}`);
            return {
              valor_unitario: Number(melhor.preco_unitario_ultimo),
              data_atualizacao: melhor.updated_at,
              estabelecimento_nome: estabelecimentoNome,
              estabelecimento_cnpj: estabelecimentoCnpj,
            };
          }
        }

        // 3. Fallback: varrer JSONB de notas_imagens do próprio usuário — janela ampliada
        const { data: notas } = await supabaseAdmin
          .from('notas_imagens')
          .select('dados_extraidos, data_criacao')
          .eq('usuario_id', userId)
          .eq('processada', true)
          .order('data_criacao', { ascending: false })
          .limit(200);
        console.log(`  📊 [HIST-CANDIDATOS] notas_imagens: ${notas?.length || 0} notas analisadas`);

        if (notas && notas.length > 0) {
          for (const nota of notas) {
            const dados: any = nota.dados_extraidos || {};
            const produtos: any[] = Array.isArray(dados?.produtos) ? dados.produtos : [];

            const candidatos = produtos
              .map((p: any) => {
                const nomeC = String(p?.descricao || p?.nome || '');
                const tokensC = tokenizar(nomeC);
                const { score, ok } = calcularMatch(tokensItem, tokensC);
                return { p, nomeC, score, ok };
              })
              .filter(c => c.ok)
              .sort((a, b) => b.score - a.score);

            if (candidatos.length > 0) {
              const melhor = candidatos[0];
              const valor = Number(
                melhor.p?.valor_unitario ?? melhor.p?.preco_unitario ?? melhor.p?.preco
              );
              if (valor && !isNaN(valor) && valor > 0) {
                const estabelecimentoNome =
                  dados?.estabelecimento?.nome ||
                  dados?.emitente?.nome ||
                  dados?.mercado?.nome ||
                  dados?.supermercado ||
                  null;
                const estabelecimentoCnpj =
                  dados?.estabelecimento?.cnpj ||
                  dados?.emitente?.cnpj ||
                  dados?.cnpj ||
                  null;
                console.log(`  📜 [HIST-NOTA] "${item.produto_nome}" ← "${melhor.nomeC}" R$ ${valor} @ ${estabelecimentoNome || '?'}`);
                return {
                  valor_unitario: valor,
                  data_atualizacao: nota.data_criacao,
                  estabelecimento_nome: estabelecimentoNome,
                  estabelecimento_cnpj: estabelecimentoCnpj,
                };
              }
            }
          }
        }
      } catch (err) {
        console.warn('  ⚠️ Falha ao buscar último preço conhecido:', err);
      }
      return null;
    };

    // Helper: casar nome de estabelecimento histórico com mercado da área de atuação
    const matchEstabelecimentoComMercado = async (estNome: string | null, estCnpj: string | null) => {
      // 1) CNPJ direto
      if (estCnpj) {
        const cnpjLimpo = estCnpj.replace(/\D/g, '');
        const porCnpj = mercados.find(m => m.cnpj && m.cnpj.replace(/\D/g, '') === cnpjLimpo);
        if (porCnpj) return porCnpj;
      }
      // 2) Nome — contains bidirecional
      if (estNome) {
        const alvo = normalizarTexto(estNome);
        if (alvo) {
          const porNome = mercados.find(m => {
            const nomeM = normalizarTexto(m.nome || '');
            if (!nomeM) return false;
            return nomeM.includes(alvo) || alvo.includes(nomeM);
          });
          if (porNome) return porNome;
        }
      }
      // 3) Fallback: consultar normalizacoes_estabelecimentos para resolver razão social ↔ fantasia
      try {
        const alvoNorm = estNome ? normalizarTexto(estNome) : '';
        const cnpjLimpo = estCnpj ? estCnpj.replace(/\D/g, '') : '';
        if (!alvoNorm && !cnpjLimpo) return null;

        const { data: normRows } = await supabaseAdmin
          .from('normalizacoes_estabelecimentos')
          .select('nome_original, nome_normalizado, cnpj_original')
          .eq('ativo', true)
          .limit(500);

        if (normRows && normRows.length > 0) {
          // Procura linha de normalização que case com o estabelecimento histórico
          const matched = normRows.find(r => {
            const orig = normalizarTexto(r.nome_original || '');
            const norm = normalizarTexto(r.nome_normalizado || '');
            const cnpjR = (r.cnpj_original || '').replace(/\D/g, '');
            if (cnpjLimpo && cnpjR && cnpjR === cnpjLimpo) return true;
            if (alvoNorm && orig && (orig.includes(alvoNorm) || alvoNorm.includes(orig))) return true;
            if (alvoNorm && norm && (norm.includes(alvoNorm) || alvoNorm.includes(norm))) return true;
            return false;
          });

          if (matched) {
            const matchedCnpj = (matched.cnpj_original || '').replace(/\D/g, '');
            const matchedNomeNorm = normalizarTexto(matched.nome_normalizado || '');
            const matchedNomeOrig = normalizarTexto(matched.nome_original || '');
            const mercadoFinal = mercados.find(m => {
              const mc = (m.cnpj || '').replace(/\D/g, '');
              const mn = normalizarTexto(m.nome || '');
              if (matchedCnpj && mc && mc === matchedCnpj) return true;
              if (mn && matchedNomeNorm && (mn.includes(matchedNomeNorm) || matchedNomeNorm.includes(mn))) return true;
              if (mn && matchedNomeOrig && (mn.includes(matchedNomeOrig) || matchedNomeOrig.includes(mn))) return true;
              return false;
            });
            if (mercadoFinal) {
              console.log(`  🔗 [REDIST-NORM] estab="${estNome}" cnpj="${estCnpj}" → mercado "${mercadoFinal.nome}" via normalizacoes_estabelecimentos`);
              return mercadoFinal;
            }
          }
        }
      } catch (errNorm) {
        console.warn('  ⚠️ Falha ao consultar normalizacoes_estabelecimentos:', errNorm);
      }

      console.log(`  ❌ [REDIST-FALHOU] estab="${estNome}" cnpj="${estCnpj}" — mercado não está na área`);
      return null;
    };

    // CENÁRIO OTIMIZADO
    const mercadosOtimizado = new Map();
    let totalOtimizado = 0;

    // Map auxiliar: itemId -> produto_master_id resolvido (para usar no fallback)
    const masterIdPorItem = new Map<string, string | null>();
    precosData.forEach(({ item, precos }: any) => {
      // armazenar master resolvido (item.produto_id pode ter sido resolvido por nome internamente,
      // mas só temos acesso aqui ao item original; o fallback usa produto_id se existir)
      masterIdPorItem.set(item.id, item.produto_id || null);
    });

    for (const { item, precos } of precosData) {
      if (precos.size === 0) {
        const ultimoPreco = await buscarUltimoPrecoConhecido(item, masterIdPorItem.get(item.id) || null);
        produtosSemPreco.push({ ...item, ultimo_preco: ultimoPreco });
        continue;
      }

      let melhorPreco = Infinity;
      let melhorMercadoId = null;
      let melhorDataAtualizacao = '';

      precos.forEach((resultado, mercadoId) => {
        if (resultado.valor < melhorPreco) {
          melhorPreco = resultado.valor;
          melhorMercadoId = mercadoId;
          melhorDataAtualizacao = resultado.data_atualizacao;
        }
      });

      if (melhorMercadoId) {
        if (!mercadosOtimizado.has(melhorMercadoId)) {
          const mercado = mercados.find(m => m.id === melhorMercadoId)!;
          mercadosOtimizado.set(melhorMercadoId, {
            id: mercado.id,
            nome: mercado.nome,
            cnpj: mercado.cnpj,
            distancia: mercado.distancia,
            total: 0,
            produtos: []
          });
        }

        const mercadoData = mercadosOtimizado.get(melhorMercadoId);
        const precoTotal = melhorPreco * item.quantidade;
        
        mercadoData.produtos.push({
          id: item.id,
          produto_nome: item.produto_nome,
          quantidade: item.quantidade,
          unidade_medida: item.unidade_medida,
          preco_unitario: melhorPreco,
          preco_total: precoTotal,
          melhor_preco: true,
          comprado: item.comprado,
          data_atualizacao: melhorDataAtualizacao
        });
        
        mercadoData.total += precoTotal;
        totalOtimizado += precoTotal;
      }
    }

    // CENÁRIOS POR MERCADO INDIVIDUAL
    const comparacao: any = {};
    const totaisPorMercado: number[] = [];

    mercados.forEach((mercado, index) => {
      let totalMercado = 0;
      const produtosMercado: any[] = [];
      const label = String.fromCharCode(65 + index); // A, B, C...

      precosData.forEach(({ item, precos }) => {
        const resultado = precos.get(mercado.id);
        
        if (resultado) {
          const precoTotal = resultado.valor * item.quantidade;
          
          // Verificar se é o melhor preço
          let melhorPreco = Infinity;
          precos.forEach(r => {
            if (r.valor < melhorPreco) melhorPreco = r.valor;
          });

          produtosMercado.push({
            id: item.id,
            produto_nome: item.produto_nome,
            quantidade: item.quantidade,
            unidade_medida: item.unidade_medida,
            preco_unitario: resultado.valor,
            preco_total: precoTotal,
            melhor_preco: resultado.valor === melhorPreco,
            economia: resultado.valor > melhorPreco ? (resultado.valor - melhorPreco) * item.quantidade : 0,
            comprado: item.comprado,
            data_atualizacao: resultado.data_atualizacao
          });
          
          totalMercado += precoTotal;
        }
      });

      totaisPorMercado.push(totalMercado);

      comparacao[`mercado${label}`] = {
        id: mercado.id,
        nome: mercado.nome,
        cnpj: mercado.cnpj,
        distancia: mercado.distancia,
        total: totalMercado,
        diferenca: totalMercado - totalOtimizado,
        produtos: produtosMercado
      };
    });

    // ===== FASE 1.1: Redistribuir itens com histórico para o mercado correspondente =====
    // Itens em produtosSemPreco com ultimo_preco.estabelecimento_* casado a um mercado da área
    // são INJETADOS no mercado (otimizado + comparação) com flag historico=true e
    // aguardando_normalizacao=true. NÃO entram em melhor_preco/economia.
    const produtosSemPrecoFinal: any[] = [];
    for (const itemSP of produtosSemPreco) {
      const up = itemSP.ultimo_preco;
      if (!up || !up.valor_unitario) {
        produtosSemPrecoFinal.push(itemSP);
        continue;
      }
      const mercadoMatch = await matchEstabelecimentoComMercado(
        up.estabelecimento_nome || null,
        up.estabelecimento_cnpj || null
      );
      if (!mercadoMatch) {
        produtosSemPrecoFinal.push(itemSP);
        continue;
      }

      const valor = Number(up.valor_unitario);
      const qtd = Number(itemSP.quantidade) || 1;
      const precoTotal = valor * qtd;
      const dataAtu = up.data_atualizacao || new Date().toISOString();

      const produtoInjetado = {
        id: itemSP.id,
        produto_nome: itemSP.produto_nome,
        quantidade: itemSP.quantidade,
        unidade_medida: itemSP.unidade_medida,
        preco_unitario: valor,
        preco_total: precoTotal,
        melhor_preco: false,
        economia: 0,
        comprado: itemSP.comprado,
        data_atualizacao: dataAtu,
        historico: true,
        aguardando_normalizacao: true,
      };

      // Injeta no OTIMIZADO
      if (!mercadosOtimizado.has(mercadoMatch.id)) {
        mercadosOtimizado.set(mercadoMatch.id, {
          id: mercadoMatch.id,
          nome: mercadoMatch.nome,
          cnpj: mercadoMatch.cnpj,
          distancia: mercadoMatch.distancia,
          total: 0,
          produtos: [],
        });
      }
      const mercadoOtim = mercadosOtimizado.get(mercadoMatch.id);
      mercadoOtim.produtos.push(produtoInjetado);
      mercadoOtim.total += precoTotal;
      totalOtimizado += precoTotal;

      // Injeta na COMPARAÇÃO
      const chaveComparacao = Object.keys(comparacao).find(
        k => comparacao[k].id === mercadoMatch.id
      );
      if (chaveComparacao) {
        comparacao[chaveComparacao].produtos.push(produtoInjetado);
        comparacao[chaveComparacao].total += precoTotal;
        const idxMercado = mercados.findIndex(m => m.id === mercadoMatch.id);
        if (idxMercado >= 0 && totaisPorMercado[idxMercado] !== undefined) {
          totaisPorMercado[idxMercado] += precoTotal;
        }
      }

      console.log(`  🎯 [INJETADO] "${itemSP.produto_nome}" no mercado "${mercadoMatch.nome}" R$ ${valor} (histórico)`);
    }

    // Recalcular diferenças de todos os mercados após injeção
    Object.keys(comparacao).forEach(k => {
      comparacao[k].diferenca = comparacao[k].total - totalOtimizado;
    });

    // Substituir lista original pela final (somente itens sem mercado correspondente)
    produtosSemPreco.length = 0;
    produtosSemPreco.push(...produtosSemPrecoFinal);

    // Calcular economia
    const maiorTotal = totaisPorMercado.length > 0 ? Math.max(...totaisPorMercado) : 0;
    const economia = maiorTotal - totalOtimizado;
    const percentualEconomia = maiorTotal > 0 ? (economia / maiorTotal) * 100 : 0;

    return new Response(
      JSON.stringify({
        supermercados: mercados,
        otimizado: {
          total: totalOtimizado,
          economia,
          percentualEconomia,
          totalMercados: mercadosOtimizado.size,
          mercados: Array.from(mercadosOtimizado.values())
        },
        comparacao,
        produtosSemPreco
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}