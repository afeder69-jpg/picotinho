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
      .ilike('categoria', categoria)
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
      .select("id, usuario_id, compra_id, dados_extraidos, processada, processing_started_at")
      .eq("id", finalNotaId)
      .single();

    if (notaError || !nota) {
      return new Response(JSON.stringify({ success: false, error: "Nota não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔒 CORREÇÃO #1: Verificar se há lock expirado (timeout de 5 minutos)
    const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
    if (nota.processing_started_at) {
      const lockAge = Date.now() - new Date(nota.processing_started_at).getTime();
      
      if (lockAge > LOCK_TIMEOUT_MS) {
        console.log(`⚠️ Lock expirado (${(lockAge/1000/60).toFixed(1)} min). Liberando...`);
        await supabase
          .from('notas_imagens')
          .update({ processing_started_at: null })
          .eq('id', finalNotaId);
      } else if (!force) {
        // Lock ainda válido, não processar
        console.log(`🔒 Nota em processamento há ${(lockAge/1000).toFixed(0)}s. Aguardando...`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "Nota já está sendo processada",
            already_processing: true 
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 🔒 LOCK ATÔMICO: Marcar nota como "em processamento"
    const agora = nowIso();
    const { data: lockData, error: lockError } = await supabase
      .from('notas_imagens')
      .update({ 
        processing_started_at: agora,
        updated_at: agora
      })
      .eq('id', finalNotaId)
      .is('processing_started_at', null) // ✅ Só atualiza se não estiver sendo processada
      .select()
      .single();

    if (lockError || !lockData) {
      console.log(`🔒 Nota ${finalNotaId} já está sendo processada por outra execução. Abortando...`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Nota já está sendo processada",
          already_processing: true 
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Lock de processamento adquirido para nota ${finalNotaId}`);

    try {
      // 💰 ATUALIZAÇÃO PREVENTIVA DE PREÇOS (ANTES DE QUALQUER CHECK)
      // Isso garante que preços sejam atualizados mesmo em re-validações
      console.log('💰 Iniciando atualização preventiva de preços atuais...');
      
      const dadosExtraidos = nota.dados_extraidos || {};
      
      // Extrair dados do estabelecimento
      const estabelecimentoCnpj = dadosExtraidos.cnpj || 
                                   dadosExtraidos.estabelecimento?.cnpj || 
                                   dadosExtraidos.supermercado?.cnpj || 
                                   dadosExtraidos.emitente?.cnpj || '';
      
      const estabelecimentoNome = dadosExtraidos.estabelecimento?.nome || 
                                   dadosExtraidos.supermercado?.nome || 
                                   dadosExtraidos.emitente?.nome || 
                                   dadosExtraidos.nome_estabelecimento || '';
      
      // ✅ CORREÇÃO: Buscar data/hora no formato novo primeiro
      let dataCompraAtual = dadosExtraidos.compra?.data_emissao || 
                            dadosExtraidos.data_emissao || 
                            dadosExtraidos.data ||
                            dadosExtraidos.emissao ||
                            new Date().toISOString().split('T')[0];
      
      let horaCompra = '00:00:00';
      
      // Parsear data e hora corretamente (formatos: "DD/MM/YYYY" ou "DD/MM/YYYY HH:MM:SS")
      if (dataCompraAtual && typeof dataCompraAtual === 'string') {
        const partes = dataCompraAtual.split(' ');
        const dataStr = partes[0];
        const horaStr = partes[1] || '00:00:00';
        
        // Converter DD/MM/YYYY para YYYY-MM-DD
        if (dataStr.includes('/')) {
          const [dia, mes, ano] = dataStr.split('/');
          dataCompraAtual = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
          horaCompra = horaStr;
        }
      }
      
      console.log(`📍 Estabelecimento: ${estabelecimentoNome} (${estabelecimentoCnpj})`);
      console.log(`📅 Data/Hora parseada: ${dataCompraAtual} ${horaCompra}`);
      
      // Buscar itens (priorizar produtos_consolidados do InfoSimples)
      const itensDaNota = dadosExtraidos.produtos || dadosExtraidos.produtos_consolidados || dadosExtraidos.itens || [];
      
      if (itensDaNota && itensDaNota.length > 0) {
        let precosAtualizados = 0;
        
        for (const item of itensDaNota) {
          const produtoNome = item.descricao || item.nome;
          const valorUnitario = parseFloat(item.valor_unitario_comercial || item.valor_unitario) || 0;
          
          if (produtoNome && valorUnitario > 0) {
            try {
              const { error: erroPrecosAtuais } = await supabase.functions.invoke('update-precos-atuais', {
                body: {
                  compraId: finalNotaId,
                  produtoNome,
                  precoUnitario: valorUnitario,
                  estabelecimentoCnpj,
                  estabelecimentoNome,
                  dataCompra: dataCompraAtual,
                  horaCompra,
                  userId: nota.usuario_id
                }
              });

              if (!erroPrecosAtuais) {
                precosAtualizados++;
              }
            } catch (error) {
              console.error(`⚠️ Erro ao atualizar preço para ${produtoNome}:`, error);
            }
          }
        }
        
        console.log(`✅ Atualização preventiva concluída: ${precosAtualizados}/${itensDaNota.length} preços atualizados`);
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
          
          // Liberar lock antes de retornar
          await supabase
            .from("notas_imagens")
            .update({ processing_started_at: null })
            .eq("id", finalNotaId);
          
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

    // Buscar produtos dos 2 formatos possíveis
    let itens: any[] = [];
    
    // ✅ CORREÇÃO: Buscar data no formato novo primeiro (compra.data_emissao)
    const dataCompra = nota.dados_extraidos?.compra?.data_emissao || 
                       nota.dados_extraidos?.data_emissao ||
                       nota.dados_extraidos?.data ||
                       new Date().toISOString().split('T')[0];

    // FORMATO 1: InfoSimples (QR Code) - dados_extraidos.produtos
    if (nota.dados_extraidos?.produtos && Array.isArray(nota.dados_extraidos.produtos)) {
      console.log("✅ Usando formato InfoSimples (produtos)");
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
    }
    // FORMATO 2: WhatsApp/Upload (PDF/Imagem) - dados_extraidos.produtos_consolidados ou itens
    else if (nota.dados_extraidos?.produtos_consolidados && Array.isArray(nota.dados_extraidos.produtos_consolidados)) {
      console.log("✅ Usando formato InfoSimples (produtos_consolidados)");
      itens = nota.dados_extraidos.produtos_consolidados.map((item: any) => {
        const quantidade = parseFloat(item.quantidade) || 0;
        const valorUnitario = parseFloat(item.valor_unitario) || 0;
        
        return {
          descricao: item.descricao || item.nome,
          categoria: item.categoria || 'outros',
          quantidade,
          valor_unitario: valorUnitario,
          unidade: normalizarUnidadeMedida(item.unidade || 'UN'),
          data_compra: dataCompra
        };
      });
      console.log(`📦 ${itens.length} produtos carregados (consolidados)`);
    }
    // FORMATO 3: WhatsApp/Upload (PDF/Imagem) - dados_extraidos.itens
    else if (nota.dados_extraidos?.itens && Array.isArray(nota.dados_extraidos.itens)) {
      console.log("✅ Usando formato WhatsApp/Upload (itens)");
      itens = nota.dados_extraidos.itens.map((item: any) => {
        const quantidade = parseFloat(item.quantidade) || 0;
        const valorUnitario = parseFloat(item.valor_unitario) || 0;
        
        return {
          descricao: item.descricao || item.nome,
          categoria: item.categoria || 'outros',
          quantidade,
          valor_unitario: valorUnitario,
          unidade: normalizarUnidadeMedida(item.unidade || 'UN'),
          data_compra: dataCompra
        };
      });
      console.log(`📦 ${itens.length} produtos carregados do WhatsApp/Upload`);
    }
    else {
      console.error("❌ Nenhum produto encontrado em dados_extraidos");
      console.error("📦 dados_extraidos completo:", JSON.stringify(nota.dados_extraidos, null, 2));
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
        // Item já existe, consolidar com preço médio ponderado
        const itemExistente = produtosConsolidados.get(key);
        
        // ✅ Calcular valor total ANTES de adicionar novo item
        const valorTotalAnterior = itemExistente.quantidade * itemExistente.preco_unitario_ultimo;
        
        // ✅ Calcular valor total do NOVO item
        const valorTotalNovo = quantidadeFinal * precoUnitarioFinal;
        
        // ✅ Somar quantidades
        itemExistente.quantidade += quantidadeFinal;
        
        // ✅ Calcular preço médio ponderado
        itemExistente.preco_unitario_ultimo = (valorTotalAnterior + valorTotalNovo) / itemExistente.quantidade;
        
        console.log(`📦 Consolidado: ${key} | Qtd: ${itemExistente.quantidade} | Preço médio: R$ ${itemExistente.preco_unitario_ultimo.toFixed(2)}`);
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
    
    // 🔒 CORREÇÃO #2: Salvar dados_extraidos ANTES de inserir no estoque (segurança contra perda de dados)
    console.log('💾 Salvando dados extraídos antes de processar estoque...');
    const { error: saveError } = await supabase
      .from('notas_imagens')
      .update({
        dados_extraidos: {
          ...nota.dados_extraidos,
          produtos_consolidados: produtosEstoque.map(p => ({
            nome: p.produto_nome,
            categoria: p.categoria,
            quantidade: p.quantidade,
            preco_unitario: p.preco_unitario_ultimo,
            unidade: p.unidade_medida
          })),
          total_itens: produtosEstoque.length
        }
      })
      .eq('id', finalNotaId);

    if (saveError) {
      console.error('⚠️ Erro ao salvar dados extraídos:', saveError);
      // Não falhar, apenas logar (dado é uma precaução)
    } else {
      console.log('✅ Dados extraídos salvos com sucesso');
    }
    
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
    
    // 🔗 FASE 2.5: VINCULAR PRODUTOS SEM MASTER A CANDIDATOS EXISTENTES
    // Para produtos que não encontraram master, buscar se já existe candidato de normalização
    console.log('🔗 Buscando candidatos de normalização existentes para produtos sem master...');
    let candidatosVinculados = 0;
    
    for (const produto of produtosEstoque) {
      // Só processar produtos sem master
      if (!produto.produto_master_id) {
        try {
          // Buscar candidato existente para esta nota + produto
          const { data: candidatos, error } = await supabase
            .from('produtos_candidatos_normalizacao')
            .select('id, status')
            .eq('nota_imagem_id', finalNotaId)
            .eq('texto_original', produto.produto_nome)
            .limit(1);
          
          if (!error && candidatos && candidatos.length > 0) {
            const candidato = candidatos[0];
            // Vincular ao candidato (será usado na inserção)
            produto.produto_candidato_id = candidato.id;
            candidatosVinculados++;
            console.log(`✅ Produto "${produto.produto_nome}" vinculado ao candidato ${candidato.id} (status: ${candidato.status})`);
          }
        } catch (err) {
          console.error(`⚠️ Erro ao buscar candidato para "${produto.produto_nome}":`, err);
          // Não falhar, apenas logar
        }
      }
    }
    
    if (candidatosVinculados > 0) {
      console.log(`🔗 ${candidatosVinculados} produtos vinculados a candidatos existentes`);
    }
    
    // 🆕 FASE 2.6: CRIAR CANDIDATOS PARA PRODUTOS SEM MASTER E SEM CANDIDATO
    // Para produtos sem master e sem candidato existente, criar novo candidato
    console.log('🤖 Criando candidatos de normalização para produtos sem master...');
    let candidatosCriados = 0;
    
    for (const produto of produtosEstoque) {
      // Só processar produtos sem master E sem candidato vinculado
      if (!produto.produto_master_id && !produto.produto_candidato_id) {
        try {
          console.log(`📝 Criando candidato para: ${produto.produto_nome}`);
          
          // ✅ CORREÇÃO 3: Padronizar hash para garantir match com processar-normalizacao-global
          const hashPadronizado = `${finalNotaId}_${produto.produto_nome.trim().toUpperCase()}`;
          
          // Criar candidato de normalização
          const { data: candidato, error: candidatoError } = await supabase
            .from('produtos_candidatos_normalizacao')
            .insert({
              texto_original: produto.produto_nome,
              usuario_id: nota.usuario_id,
              nota_imagem_id: finalNotaId,
              nota_item_hash: hashPadronizado, // ✅ Hash padronizado
              status: 'pendente',
              confianca_ia: 0, // Será preenchido por processar-normalizacao-global
              categoria_sugerida: produto.categoria,
              marca_sugerida: produto.marca || null,
              nome_base_sugerido: produto.nome_base || produto.produto_nome
            })
            .select()
            .single();
          
          if (candidatoError) {
            console.error(`⚠️ Erro ao criar candidato para "${produto.produto_nome}":`, candidatoError.message);
            // Continuar processamento mesmo com erro (produto fica sem candidato temporariamente)
          } else if (candidato) {
            // Vincular o candidato ao produto
            produto.produto_candidato_id = candidato.id;
            candidatosCriados++;
            console.log(`✅ Candidato criado: ${candidato.id} para "${produto.produto_nome}"`);
          }
        } catch (err: any) {
          console.error(`❌ Exceção ao criar candidato para "${produto.produto_nome}":`, err.message);
          // Continuar processamento
        }
      }
    }
    
    console.log(`📊 Criação de candidatos concluída: ${candidatosCriados} novos candidatos`);
    
    if (candidatosCriados > 0) {
      console.log(`🎯 Total de produtos sem master: ${masterNaoEncontrados}`);
      console.log(`   - ${candidatosVinculados} vinculados a candidatos existentes`);
      console.log(`   - ${candidatosCriados} novos candidatos criados`);
      console.log(`   - ${masterNaoEncontrados - candidatosVinculados - candidatosCriados} sem candidato (erros)`);
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
    
    // 🚨 CORREÇÃO #3: VALIDAÇÃO CRÍTICA com auto-correção - NÃO marcar como processada se houver discrepância
    const itensEsperados = produtosEstoque.length;
    const itensInseridos = totalInserted;
    
    if (itensInseridos !== itensEsperados) {
      console.error(`🚨 INCONSISTÊNCIA CRÍTICA: Esperado ${itensEsperados} itens, inserido ${itensInseridos}`);
      console.error('🚨 Produtos que deveriam ser inseridos:', produtosEstoque.map(p => p.produto_nome));
      console.error('🚨 Produtos efetivamente inseridos:', inserted.map(p => p.produto_nome));
      
      // ✅ NÃO MARCAR COMO PROCESSADA - Permitir reprocessamento automático
      await supabase
        .from('notas_imagens')
        .update({ 
          processing_started_at: null, // Liberar lock
          debug_texto: `Inserção parcial: ${itensInseridos}/${itensEsperados} itens. Reprocessamento necessário.`
        })
        .eq('id', finalNotaId);
      
      console.log('🔓 Lock liberado devido a inserção parcial. Nota disponível para reprocessamento.');
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Inserção incompleta: ${itensInseridos}/${itensEsperados} itens`,
          nota_id: finalNotaId,
          requires_reprocessing: true
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.log('✅ Validação OK: Todos os itens foram inseridos corretamente');
    }

    // Marcar nota como processada e liberar lock
    const { error: updateError } = await supabase
      .from("notas_imagens")
      .update({ 
        processada: true, 
        processing_started_at: null, // ✅ Liberar lock
        updated_at: nowIso() 
      })
      .eq("id", finalNotaId);
    
    if (updateError) {
      console.error("⚠️ Erro ao marcar nota como processada:", updateError);
      // Não falhar por isso, pois o estoque já foi inserido
    }
    
    console.log(`🔓 Lock de processamento liberado para nota ${finalNotaId}`);

    // 🤖 DISPARAR NORMALIZAÇÃO AUTOMÁTICA EM BACKGROUND
    console.log('🤖 Disparando normalização automática em background...');
    supabase.functions.invoke('processar-normalizacao-global', {
      body: { 
        nota_id: finalNotaId,
        auto_trigger: true 
      }
    }).then(({ data, error }) => {
      if (error) {
        console.error('⚠️ Erro ao disparar normalização automática:', error);
      } else {
        console.log('✅ Normalização automática disparada com sucesso:', data);
      }
    }).catch(err => {
      console.error('⚠️ Falha ao invocar normalização:', err);
    });

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
      
      // 🔓 Liberar lock em caso de erro
      await supabase
        .from("notas_imagens")
        .update({ processing_started_at: null })
        .eq("id", finalNotaId);
      
      return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("❌ Erro crítico:", error?.message || error);
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
