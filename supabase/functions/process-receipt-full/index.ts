// supabase/functions/process-receipt-full/index.ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

// ================== CONFIG CORS ==================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ================== HELPERS ==================
function nowIso() {
  return new Date().toISOString();
}

// Normalizar unidades para o padrão Picotinho: Un, Kg, Lt
function normalizarUnidadeMedida(unidade: string): string {
  if (!unidade) return 'Un';
  
  const unidadeLimpa = unidade.trim().toUpperCase();
  
  // Mapeamento para padrão Picotinho
  const mapeamento: { [key: string]: string } = {
    'PC': 'Un',
    'UNIDADE': 'Un',
    'UN': 'Un',
    'UND': 'Un',
    'PEÇA': 'Un',
    'PECA': 'Un',
    'G': 'Kg',
    'GRAMAS': 'Kg',
    'GRAMA': 'Kg',
    'KG': 'Kg',
    'QUILO': 'Kg',
    'KILO': 'Kg',
    'ML': 'Lt',
    'MILILITRO': 'Lt',
    'MILILITROS': 'Lt',
    'L': 'Lt',
    'LT': 'Lt',
    'LITRO': 'Lt',
    'LITROS': 'Lt'
  };
  
  return mapeamento[unidadeLimpa] || unidadeLimpa;
}

// 🥚 Detectar quantidade em embalagem para produtos multi-unidade (ex: ovos)
function detectarQuantidadeEmbalagem(nomeProduto: string, precoTotal: number): { 
  isMultiUnit: boolean; 
  quantity: number; 
  unitPrice: number;
} {
  const nomeUpper = nomeProduto.toUpperCase();
  
  // Verificar se é produto de ovos
  const isOvo = /\b(OVO|OVOS)\b/.test(nomeUpper) && 
                !/\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b/.test(nomeUpper);
  
  if (!isOvo) {
    return { isMultiUnit: false, quantity: 1, unitPrice: precoTotal };
  }
  
  // Padrões de detecção de quantidade em embalagens
  const patterns = [
    /\bC\/(\d+)\b/i,           // C/30, C/20
    /\b(\d+)\s*UN(IDADES)?\b/i, // 30 UNIDADES, 30UN
    /\b(\d+)\s*OVO/i,          // 30 OVOS
    /\bDZ(\d+)\b/i             // DZ12 (dúzia)
  ];
  
  for (const pattern of patterns) {
    const match = nomeProduto.match(pattern);
    if (match) {
      const qty = parseInt(match[1]);
      if (qty > 1 && qty <= 60) { // Razoável para ovos
        const unitPrice = precoTotal / qty;
        console.log(`🥚 OVOS DETECTADO: "${nomeProduto}" → ${qty} unidades (R$ ${unitPrice.toFixed(2)}/un)`);
        return { isMultiUnit: true, quantity: qty, unitPrice };
      }
    }
  }
  
  // Não encontrou quantidade específica, assumir 1
  return { isMultiUnit: false, quantity: 1, unitPrice: precoTotal };
}

// ================== NORMALIZAÇÃO MASTER - FASE 2 ==================

// 🔥 Cache em memória para produtos master já buscados
const masterCache = new Map<string, any>();

// 🎚️ Feature flag: pode desabilitar busca master via env var
const ENABLE_MASTER_SEARCH = Deno.env.get('ENABLE_MASTER_SEARCH') !== 'false';

// 📊 Calcular similaridade entre dois textos (Levenshtein distance simplificada)
function calcularSimilaridade(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  // Inicializar matriz
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Preencher matriz
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Deleção
        matrix[i][j - 1] + 1,      // Inserção
        matrix[i - 1][j - 1] + cost // Substituição
      );
    }
  }

  // Calcular porcentagem de similaridade
  const maxLen = Math.max(len1, len2);
  const distance = matrix[len1][len2];
  return 1 - (distance / maxLen);
}

// 🔍 Buscar produto master correspondente com timeout e fallback
async function buscarProdutoMaster(
  produtoNome: string,
  categoria: string,
  supabase: any
): Promise<{ found: boolean; master: any | null }> {
  
  // 1️⃣ Verificar feature flag
  if (!ENABLE_MASTER_SEARCH) {
    return { found: false, master: null };
  }
  
  // 2️⃣ Verificar cache
  const cacheKey = `${produtoNome}|${categoria}`.toUpperCase();
  if (masterCache.has(cacheKey)) {
    const cached = masterCache.get(cacheKey);
    if (cached) {
      console.log(`🔥 Cache HIT: ${produtoNome} → ${cached.nome_padrao}`);
      return { found: true, master: cached };
    }
  }
  
  try {
    // 3️⃣ Buscar com timeout de 2 segundos
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 2000)
    );
    
    const searchPromise = supabase
      .from('produtos_master_global')
      .select('*')
      .eq('categoria', categoria)
      .eq('status', 'ativo')
      .limit(10);
    
    const result = await Promise.race([searchPromise, timeoutPromise]) as any;
    const { data, error } = result;
    
    if (error || !data || data.length === 0) {
      masterCache.set(cacheKey, null);
      return { found: false, master: null };
    }
    
    // 4️⃣ Calcular similaridade e encontrar melhor match
    const nomeNormalizado = produtoNome.toUpperCase();
    let melhorMatch = null;
    let melhorScore = 0;
    
    for (const master of data) {
      const score = calcularSimilaridade(
        nomeNormalizado, 
        master.nome_padrao.toUpperCase()
      );
      
      // Threshold: 85% de similaridade mínima
      if (score > melhorScore && score >= 0.85) {
        melhorScore = score;
        melhorMatch = master;
      }
    }
    
    if (melhorMatch) {
      // 5️⃣ Salvar no cache
      masterCache.set(cacheKey, melhorMatch);
      console.log(`✅ Master encontrado: ${produtoNome} → ${melhorMatch.nome_padrao} (${(melhorScore * 100).toFixed(0)}%)`);
      return { found: true, master: melhorMatch };
    }
    
    // Não encontrou match com similaridade suficiente
    masterCache.set(cacheKey, null);
    return { found: false, master: null };
    
  } catch (error: any) {
    // 6️⃣ FALLBACK: Em caso de erro/timeout, continuar sem master
    if (error.message === 'Timeout') {
      console.warn(`⏱️ Timeout ao buscar master para "${produtoNome}" - continuando sem normalização`);
    } else {
      console.warn(`⚠️ Erro ao buscar master para "${produtoNome}": ${error.message}`);
    }
    masterCache.set(cacheKey, null);
    return { found: false, master: null };
  }
}

// ================== EDGE FUNCTION ==================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { notaId, imagemId, force } = body || {};
    
    // Aceitar tanto notaId quanto imagemId para compatibilidade
    const finalNotaId = notaId || imagemId;

    if (!finalNotaId) {
      return new Response(JSON.stringify({ success: false, error: "ID da nota é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🏁 process-receipt-full START - nota_id=${finalNotaId}, force=${force || false}`);

    // 🛡️ PROTEÇÃO CONTRA RE-PROCESSAMENTO
    // Buscar nota com verificação de status processada
    const { data: nota, error: notaError } = await supabase
      .from("notas_imagens")
      .select("id, usuario_id, compra_id, dados_extraidos, processada")
      .eq("id", finalNotaId)
      .single();

    if (notaError || !nota) {
      return new Response(JSON.stringify({ success: false, error: "Nota não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🛡️ VERIFICAÇÃO ANTI-DUPLICAÇÃO INTELIGENTE
    if (nota.processada && !force) {
      // Verificar se já existem itens no estoque para esta nota
      const { data: estoqueExistente } = await supabase
        .from("estoque_app")
        .select("*")
        .eq("nota_id", finalNotaId)
        .eq("user_id", nota.usuario_id);
      
      // SÓ bloquear se realmente há itens no estoque (duplicação real)
      if (estoqueExistente && estoqueExistente.length > 0) {
        console.log(`⚠️ NOTA JÁ PROCESSADA COM ESTOQUE - Bloqueando re-processamento para nota ${finalNotaId} (${estoqueExistente.length} itens no estoque)`);
        
        const totalFinanceiro = estoqueExistente.reduce((acc: number, it: any) => 
          acc + (it.quantidade * it.preco_unitario_ultimo), 0);
        
        return new Response(
          JSON.stringify({
            success: true,
            message: "Nota já foi processada anteriormente",
            nota_id: finalNotaId,
            itens_inseridos: estoqueExistente.length,
            total_financeiro: totalFinanceiro.toFixed(2),
            already_processed: true
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Nota marcada como processada MAS sem itens no estoque = processamento incompleto
        console.log(`🔧 CORREÇÃO DE PROCESSAMENTO INCOMPLETO - Nota ${finalNotaId} estava marcada como processada mas sem itens no estoque. Processando...`);
      }
    }

    if (force) {
      console.log(`🔄 REPROCESSAMENTO FORÇADO - Reprocessando nota ${finalNotaId} por solicitação manual`);
    }

    // Buscar produtos de dados_extraidos (InfoSimples)
    let itens: any[] = [];
    
    if (nota.dados_extraidos?.produtos && Array.isArray(nota.dados_extraidos.produtos)) {
      const dataCompra = nota.dados_extraidos?.data_emissao || 
                        new Date().toISOString().split('T')[0];
      
      itens = nota.dados_extraidos.produtos.map((item: any) => {
        const quantidade = parseFloat(item.quantidade_comercial || item.quantidade) || 0;
        const valorUnitario = parseFloat(item.valor_unitario_comercial || item.valor_unitario) || 
                             (parseFloat(item.normalizado_valor || item.valor) / quantidade) || 0;
        
        return {
          descricao: item.descricao || item.nome,
          categoria: item.categoria || 'outros',
          quantidade,
          valor_unitario: valorUnitario,
          unidade: normalizarUnidadeMedida(item.unidade_comercial || item.unidade || 'UN'),
          data_compra: dataCompra
        };
      });
      console.log(`📦 ${itens.length} produtos carregados do InfoSimples`);
    } else {
      console.error("❌ Nenhum produto encontrado em dados_extraidos");
    }

    if (!itens || itens.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Nenhum item encontrado na nota" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limpar estoque anterior dessa nota com transaction safety
    const { error: deleteError } = await supabase
      .from("estoque_app")
      .delete()
      .eq("nota_id", finalNotaId)
      .eq("user_id", nota.usuario_id);
    
    if (deleteError) {
      console.error("❌ Erro ao limpar estoque anterior:", deleteError);
      // Não falhar por isso, apenas logar
    }

    // Consolidar itens duplicados antes de inserir no estoque
    const produtosConsolidados = new Map<string, any>();
    
    for (const item of itens) {
      const key = item.descricao; // usar descrição como chave para consolidar
      
      // 🥚 TRATAMENTO ESPECIAL: Detectar quantidade em embalagem
      const valorTotal = item.quantidade * item.valor_unitario;
      const embalagemInfo = detectarQuantidadeEmbalagem(item.descricao, valorTotal);
      
      // Quantidade e preço final considerando embalagem
      const quantidadeFinal = embalagemInfo.isMultiUnit ? embalagemInfo.quantity : item.quantidade;
      const precoUnitarioFinal = embalagemInfo.isMultiUnit ? embalagemInfo.unitPrice : item.valor_unitario;
      
      if (produtosConsolidados.has(key)) {
        // Item já existe, somar quantidades
        const itemExistente = produtosConsolidados.get(key);
        itemExistente.quantidade += quantidadeFinal;
        // Manter o preço unitário mais recente (último item)
        itemExistente.preco_unitario_ultimo = precoUnitarioFinal;
      } else {
        // Novo item
        produtosConsolidados.set(key, {
          user_id: nota.usuario_id,
          nota_id: nota.id,
          produto_nome: item.descricao,
          categoria: item.categoria || 'outros',
          quantidade: quantidadeFinal,
          unidade_medida: normalizarUnidadeMedida(item.unidade || 'unidade'),
          preco_unitario_ultimo: precoUnitarioFinal,
          compra_id: nota.compra_id,
          origem: "nota_fiscal",
        });
      }
    }

    // Converter Map para Array
    const produtosEstoque = Array.from(produtosConsolidados.values());
    
    console.log(`📦 Itens únicos para inserir no estoque: ${produtosEstoque.length} (de ${itens.length} itens originais)`);
    
    // 🔍 FASE 2: BUSCAR PRODUTO MASTER PARA CADA ITEM
    console.log('🔍 Iniciando busca de produtos master...');
    let masterEncontrados = 0;
    let masterNaoEncontrados = 0;
    
    for (const produto of produtosEstoque) {
      try {
        const resultado = await buscarProdutoMaster(
          produto.produto_nome,
          produto.categoria,
          supabase
        );
        
        if (resultado.found && resultado.master) {
          // ✅ Master encontrado! Atualizar produto com dados normalizados
          produto.sku_global = resultado.master.sku_global;
          produto.produto_master_id = resultado.master.id;
          produto.produto_nome = resultado.master.nome_padrao; // Nome normalizado
          produto.marca = resultado.master.marca;
          produto.categoria = resultado.master.categoria;
          produto.produto_nome_normalizado = resultado.master.nome_padrao;
          produto.nome_base = resultado.master.nome_base;
          masterEncontrados++;
          
          console.log(`✅ Normalizado: ${produto.produto_nome} (SKU: ${produto.sku_global})`);
        } else {
          // ⚠️ Master não encontrado, inserir sem normalizar (sku_global = NULL)
          masterNaoEncontrados++;
          console.log(`⚠️ Sem master: ${produto.produto_nome} (será enviado para aprovação)`);
        }
      } catch (error: any) {
        // 🛡️ FALLBACK: Erro ao buscar master, continuar sem ele
        console.error(`❌ Erro ao buscar master para ${produto.produto_nome}:`, error.message);
        masterNaoEncontrados++;
      }
    }
    
    console.log(`📊 Busca de master concluída: ${masterEncontrados} normalizados (${((masterEncontrados/produtosEstoque.length)*100).toFixed(1)}%), ${masterNaoEncontrados} sem master`);
    
    if (masterEncontrados > 0) {
      console.log(`🎉 Taxa de normalização automática: ${((masterEncontrados/produtosEstoque.length)*100).toFixed(1)}%`);
    }
    
    // 🚨 DEBUG CRÍTICO: Verificar se os produtos problemáticos estão na lista
    const produtosProblematicos = ['Queijo Parmesão President', 'Filé de Peito de Frango', 'Creme de Leite Italac', 'Requeijão Cremoso Tirolez'];
    
    console.log('🔍 AUDITORIA DOS PRODUTOS PROBLEMÁTICOS:');
    produtosProblematicos.forEach(produtoTeste => {
      const encontrado = produtosEstoque.find(p => p.produto_nome.includes(produtoTeste.split(' ')[0]));
      if (encontrado) {
        console.log(`✅ ${produtoTeste}: ENCONTRADO - ${encontrado.produto_nome} | Cat: ${encontrado.categoria} | Qtd: ${encontrado.quantidade}`);
      } else {
        console.log(`❌ ${produtoTeste}: NÃO ENCONTRADO na lista de inserção!`);
      }
    });
    
    // Mostrar todos os produtos que vão ser inseridos
    console.log('📋 Lista completa para inserção:');
    produtosEstoque.forEach((produto, index) => {
      console.log(`${index + 1}. ${produto.produto_nome} | Cat: ${produto.categoria} | Qtd: ${produto.quantidade} | Preço: ${produto.preco_unitario_ultimo}`);
    });

    // Inserir no estoque com batch processing para alto volume
    if (produtosEstoque.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Nenhum produto válido para inserir" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Para alto volume: processar em lotes de 50 itens por vez
    const BATCH_SIZE = 50;
    let totalInserted = 0;
    const allInserted: any[] = [];
    
    for (let i = 0; i < produtosEstoque.length; i += BATCH_SIZE) {
      const batch = produtosEstoque.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(produtosEstoque.length/BATCH_SIZE)} (${batch.length} itens)`);
      
      const { data: batchInserted, error: batchError } = await supabase
        .from("estoque_app")
        .insert(batch)
        .select();
      
      if (batchError) {
        console.error(`❌ Erro no lote ${Math.floor(i/BATCH_SIZE) + 1}:`, batchError);
        throw new Error(`Erro ao inserir lote: ${batchError.message}`);
      }
      
      if (batchInserted) {
        allInserted.push(...batchInserted);
        totalInserted += batchInserted.length;
      }
    }
    
    const inserted = allInserted;

    console.log(`✅ ${totalInserted} itens inseridos no estoque (${Math.ceil(produtosEstoque.length/BATCH_SIZE)} lotes processados)`);
    
    // 🚨 VALIDAÇÃO CRÍTICA: Verificar se todos os itens foram inseridos corretamente
    const itensEsperados = produtosEstoque.length;
    const itensInseridos = totalInserted;
    
    if (itensInseridos !== itensEsperados) {
      console.error(`🚨 INCONSISTÊNCIA CRÍTICA: Esperado ${itensEsperados} itens, inserido ${itensInseridos}`);
      console.error('🚨 Produtos que deveriam ser inseridos:', produtosEstoque.map(p => p.produto_nome));
      console.error('🚨 Produtos efetivamente inseridos:', inserted.map(p => p.produto_nome));
    } else {
      console.log('✅ Validação OK: Todos os itens foram inseridos corretamente');
    }

    // 💰 ATUALIZAÇÃO AUTOMÁTICA DE PREÇOS
    console.log('💰 Iniciando atualização automática de preços atuais...');
    
    // Extrair dados do estabelecimento
    const estabelecimentoCnpj = dadosExtraidos.cnpj || 
                                 dadosExtraidos.estabelecimento?.cnpj || 
                                 dadosExtraidos.supermercado?.cnpj || 
                                 dadosExtraidos.emitente?.cnpj || '';
    
    const estabelecimentoNome = dadosExtraidos.estabelecimento?.nome || 
                                 dadosExtraidos.supermercado?.nome || 
                                 dadosExtraidos.emitente?.nome || 
                                 dadosExtraidos.nome_estabelecimento || '';
    
    const dataCompra = dadosExtraidos.data_emissao || 
                      dadosExtraidos.data || 
                      dadosExtraidos.emissao || 
                      new Date().toISOString().split('T')[0];
    
    const horaCompra = dadosExtraidos.hora_emissao || 
                      dadosExtraidos.hora || 
                      '00:00:00';

    console.log(`📍 Estabelecimento: ${estabelecimentoNome} (${estabelecimentoCnpj})`);
    console.log(`📅 Data/Hora: ${dataCompra} ${horaCompra}`);

    // Atualizar preços para cada item do estoque
    let precosAtualizados = 0;
    let errosAtualizacao = 0;
    
    for (const item of produtosEstoque) {
      if (item.preco_unitario_ultimo && item.preco_unitario_ultimo > 0) {
        try {
          const { error: erroPrecosAtuais } = await supabase.functions.invoke('update-precos-atuais', {
            body: {
              compraId: finalNotaId,
              produtoNome: item.produto_nome,
              precoUnitario: item.preco_unitario_ultimo,
              estabelecimentoCnpj,
              estabelecimentoNome,
              dataCompra,
              horaCompra,
              userId
            }
          });

          if (erroPrecosAtuais) {
            console.error(`⚠️ Erro ao atualizar preço para ${item.produto_nome}:`, erroPrecosAtuais);
            errosAtualizacao++;
          } else {
            console.log(`💾 Preço atualizado: ${item.produto_nome} = R$ ${item.preco_unitario_ultimo}`);
            precosAtualizados++;
          }
        } catch (error) {
          console.error(`⚠️ Erro ao chamar update-precos-atuais para ${item.produto_nome}:`, error);
          errosAtualizacao++;
        }
      }
    }
    
    console.log(`✅ Atualização de preços concluída: ${precosAtualizados} atualizados, ${errosAtualizacao} erros`);

    // Marcar nota como processada com retry em caso de falha
    const { error: updateError } = await supabase
      .from("notas_imagens")
      .update({ processada: true, updated_at: nowIso() })
      .eq("id", finalNotaId);
    
    if (updateError) {
      console.error("⚠️ Erro ao marcar nota como processada:", updateError);
      // Não falhar por isso, pois o estoque já foi inserido
    }

    const totalFinanceiro = inserted.reduce((acc: number, it: any) => acc + it.quantidade * it.preco_unitario_ultimo, 0);

    return new Response(
      JSON.stringify({
        success: true,
        nota_id: finalNotaId,
        itens_inseridos: inserted.length,
        total_financeiro: totalFinanceiro.toFixed(2),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Erro geral:", error?.message || error);
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
