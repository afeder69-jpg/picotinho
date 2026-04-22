import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

interface RecategorizationRule {
  keywords: string[];
  categorias_origem?: string[] | null;
  categoria_destino: string;
  descricao: string;
  ativa: boolean;
}

interface Mudanca {
  produto_nome: string;
  categoria_anterior: string;
  categoria_nova: string;
  razao: string;
  status: 'sucesso' | 'erro';
  propagados_estoque?: number;
}

interface ConflitosDetectados {
  keyword: string;
  destinos: string[];
  regra_ids: string[];
}

// Normalizar texto: lowercase, sem acentos
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Tokenizar texto em palavras
function tokenize(text: string): string[] {
  return normalizeText(text).split(/\s+/).filter(t => t.length > 0);
}

// Verificar se keyword faz match no nome do produto (por token, não substring)
function keywordMatchesProduct(keyword: string, productName: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  const normalizedProduct = normalizeText(productName);
  
  // Se a keyword tem múltiplas palavras, verificar como frase contígua
  const keywordTokens = tokenize(keyword);
  const productTokens = tokenize(productName);
  
  if (keywordTokens.length === 1) {
    // Keyword de uma palavra: match exato por token
    return productTokens.some(token => token === keywordTokens[0]);
  }
  
  // Keyword multi-palavra: verificar sequência contígua de tokens
  for (let i = 0; i <= productTokens.length - keywordTokens.length; i++) {
    let match = true;
    for (let j = 0; j < keywordTokens.length; j++) {
      if (productTokens[i + j] !== keywordTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: master-only.
  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Iniciando recategorização inteligente no MASTER...');

    // =====================================================
    // ETAPA 1: Buscar regras ativas
    // =====================================================
    const { data: regras, error: regrasError } = await supabase
      .from('regras_recategorizacao')
      .select('id, keywords, categorias_origem, categoria_destino, descricao, ativa')
      .eq('ativa', true);

    if (regrasError) {
      throw new Error(`Erro ao buscar regras: ${regrasError.message}`);
    }

    if (!regras || regras.length === 0) {
      return new Response(JSON.stringify({
        sucesso: true,
        produtos_master_analisados: 0,
        produtos_alterados: 0,
        produtos_ja_corretos: 0,
        produtos_ignorados: 0,
        produtos_com_conflito: 0,
        conflitos_detectados: [],
        mudancas: [],
        estoque_propagados: 0,
        timestamp: new Date().toISOString(),
        aviso: 'Nenhuma regra ativa encontrada'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    console.log(`📋 Total de regras ativas: ${regras.length}`);

    // =====================================================
    // ETAPA 2: Detectar conflitos entre regras
    // =====================================================
    const keywordMap = new Map<string, { destinos: Set<string>; regra_ids: Set<string> }>();
    
    for (const regra of regras) {
      for (const kw of regra.keywords) {
        const normalizedKw = normalizeText(kw);
        if (!keywordMap.has(normalizedKw)) {
          keywordMap.set(normalizedKw, { destinos: new Set(), regra_ids: new Set() });
        }
        const entry = keywordMap.get(normalizedKw)!;
        entry.destinos.add(regra.categoria_destino.toUpperCase());
        entry.regra_ids.add(regra.id);
      }
    }

    const conflitos: ConflitosDetectados[] = [];
    const keywordsComConflito = new Set<string>();
    
    for (const [keyword, entry] of keywordMap) {
      if (entry.destinos.size > 1) {
        conflitos.push({
          keyword,
          destinos: Array.from(entry.destinos),
          regra_ids: Array.from(entry.regra_ids),
        });
        keywordsComConflito.add(keyword);
        console.warn(`⚠️ CONFLITO: keyword "${keyword}" tem destinos conflitantes: ${Array.from(entry.destinos).join(', ')}`);
      }
    }

    // =====================================================
    // ETAPA 3: Preparar regras sem conflito, com prioridade
    // =====================================================
    // Prioridade: regras globais (sem categorias_origem) primeiro, depois específicas
    const regrasGlobais: RecategorizationRule[] = [];
    const regrasEspecificas: RecategorizationRule[] = [];
    
    for (const regra of regras) {
      // Excluir regras cujas keywords estejam todas em conflito
      const temKeywordValida = regra.keywords.some(kw => !keywordsComConflito.has(normalizeText(kw)));
      if (!temKeywordValida) {
        console.warn(`⏭️ Regra "${regra.descricao}" pulada: todas as keywords em conflito`);
        continue;
      }
      
      if (!regra.categorias_origem || regra.categorias_origem.length === 0) {
        regrasGlobais.push(regra);
      } else {
        regrasEspecificas.push(regra);
      }
    }

    // Regras ordenadas: globais primeiro, depois específicas
    const regrasOrdenadas = [...regrasGlobais, ...regrasEspecificas];

    // =====================================================
    // ETAPA 4: Buscar todos os produtos master
    // =====================================================
    const { data: produtos, error: produtosError } = await supabase
      .from('produtos_master_global')
      .select('id, nome_padrao, categoria');

    if (produtosError) {
      throw new Error(`Erro ao buscar produtos master: ${produtosError.message}`);
    }

    console.log(`📦 Total de produtos master: ${produtos?.length || 0}`);

    const mudancas: Mudanca[] = [];
    let produtosAlterados = 0;
    let produtosJaCorretos = 0;
    let produtosIgnorados = 0;
    let produtosComConflito = 0;
    let estoquePropagados = 0;

    for (const produto of produtos || []) {
      const nomeProduto = produto.nome_padrao;
      const categoriaAtual = (produto.categoria ?? '').toUpperCase();
      
      // =====================================================
      // ETAPA 5: Coletar TODAS as regras que casam com o produto
      // =====================================================
      interface RegraMatch {
        regra: RecategorizationRule;
        maxTokens: number; // maior nº de tokens entre as keywords que casaram
        isGlobal: boolean;
        descricao: string;
      }

      const matches: RegraMatch[] = [];

      for (const regra of regrasOrdenadas) {
        // Verificar match de keyword (somente keywords sem conflito)
        let maxTokensForMatch = 0;
        let hasMatch = false;

        for (const kw of regra.keywords) {
          if (keywordsComConflito.has(normalizeText(kw))) continue;
          if (keywordMatchesProduct(kw, nomeProduto)) {
            hasMatch = true;
            const tokens = tokenize(kw).length;
            if (tokens > maxTokensForMatch) maxTokensForMatch = tokens;
          }
        }

        if (!hasMatch) continue;

        // Se é regra específica, verificar categoria de origem
        const isGlobal = !regra.categorias_origem || regra.categorias_origem.length === 0;
        if (!isGlobal) {
          const origemMatch = regra.categorias_origem!.some(cat =>
            categoriaAtual === cat.toUpperCase()
          );
          if (!origemMatch) continue;
        }

        matches.push({
          regra,
          maxTokens: maxTokensForMatch,
          isGlobal,
          descricao: regra.descricao,
        });
      }

      if (matches.length === 0) {
        produtosIgnorados++;
        continue;
      }

      // =====================================================
      // ETAPA 6: Selecionar regra vencedora por especificidade
      // =====================================================
      // Ordenar: 1) mais tokens vence, 2) global vence específica, 3) descrição alfabética (determinístico)
      matches.sort((a, b) => {
        if (b.maxTokens !== a.maxTokens) return b.maxTokens - a.maxTokens;
        if (a.isGlobal !== b.isGlobal) return a.isGlobal ? -1 : 1;
        return a.descricao.localeCompare(b.descricao);
      });

      const regraVencedora = matches[0];

      if (matches.length > 1 && matches[0].regra.categoria_destino !== matches[1].regra.categoria_destino) {
        console.log(`🏆 Produto "${nomeProduto}": regra "${regraVencedora.descricao}" (${regraVencedora.maxTokens} tokens) venceu sobre "${matches[1].descricao}" (${matches[1].maxTokens} tokens)`);
      }

      const categoriaDestino = regraVencedora.regra.categoria_destino.toUpperCase();

      // Idempotência: se já está na categoria correta, pular
      if (categoriaAtual === categoriaDestino) {
        produtosJaCorretos++;
        continue;
      }

      // =====================================================
      // ETAPA 7: Atualizar o produto MASTER
      // =====================================================
      console.log(`🔄 Master: ${nomeProduto} | ${categoriaAtual} → ${categoriaDestino}`);

      const { error: updateError } = await supabase
        .from('produtos_master_global')
        .update({
          categoria: categoriaDestino,
          updated_at: new Date().toISOString()
        })
        .eq('id', produto.id);

      if (updateError) {
        console.error(`❌ Erro ao atualizar master ${nomeProduto}:`, updateError.message);
        mudancas.push({
          produto_nome: nomeProduto,
          categoria_anterior: categoriaAtual,
          categoria_nova: categoriaDestino,
          razao: regraVencedora.regra.descricao,
          status: 'erro'
        });
        continue;
      }

      // =====================================================
      // ETAPA 8: Propagar para estoque_app (apenas vinculados)
      // =====================================================
      const categoriaEstoque = categoriaDestino.toLowerCase();
      const { data: estoqueAtualizado, error: estoqueError } = await supabase
        .from('estoque_app')
        .update({
          categoria: categoriaEstoque,
          updated_at: new Date().toISOString()
        })
        .eq('produto_master_id', produto.id)
        .neq('categoria', categoriaEstoque)
        .select('id');

      const propagados = estoqueAtualizado?.length || 0;
      if (estoqueError) {
        console.warn(`⚠️ Erro ao propagar para estoque do master ${nomeProduto}:`, estoqueError.message);
      } else if (propagados > 0) {
        console.log(`   📦 Propagado para ${propagados} registros de estoque`);
      }

      estoquePropagados += propagados;
      produtosAlterados++;
      mudancas.push({
        produto_nome: nomeProduto,
        categoria_anterior: categoriaAtual,
        categoria_nova: categoriaDestino,
        razao: regraVencedora.regra.descricao,
        status: 'sucesso',
        propagados_estoque: propagados,
      });
    }

    // =====================================================
    // ETAPA 9: Segunda passagem — itens órfãos no estoque_app
    // =====================================================
    console.log('🔍 Iniciando segunda passagem: itens órfãos no estoque_app (sem produto_master_id)...');

    const { data: itensOrfaos, error: orfaosError } = await supabase
      .from('estoque_app')
      .select('id, produto_nome, categoria, user_id')
      .is('produto_master_id', null);

    if (orfaosError) {
      console.error('❌ Erro ao buscar itens órfãos:', orfaosError.message);
    }

    let orfaosAlterados = 0;
    let orfaosJaCorretos = 0;
    let orfaosIgnorados = 0;

    for (const item of itensOrfaos || []) {
      const nomeProduto = item.produto_nome;
      const categoriaAtual = (item.categoria ?? '').toUpperCase();

      interface RegraMatchOrfao {
        regra: RecategorizationRule;
        maxTokens: number;
        isGlobal: boolean;
        descricao: string;
      }

      const matches: RegraMatchOrfao[] = [];

      for (const regra of regrasOrdenadas) {
        let maxTokensForMatch = 0;
        let hasMatch = false;

        for (const kw of regra.keywords) {
          if (keywordsComConflito.has(normalizeText(kw))) continue;
          if (keywordMatchesProduct(kw, nomeProduto)) {
            hasMatch = true;
            const tokens = tokenize(kw).length;
            if (tokens > maxTokensForMatch) maxTokensForMatch = tokens;
          }
        }

        if (!hasMatch) continue;

        const isGlobal = !regra.categorias_origem || regra.categorias_origem.length === 0;
        if (!isGlobal) {
          const origemMatch = regra.categorias_origem!.some(cat =>
            categoriaAtual === cat.toUpperCase()
          );
          if (!origemMatch) continue;
        }

        matches.push({
          regra,
          maxTokens: maxTokensForMatch,
          isGlobal,
          descricao: regra.descricao,
        });
      }

      if (matches.length === 0) {
        orfaosIgnorados++;
        continue;
      }

      matches.sort((a, b) => {
        if (b.maxTokens !== a.maxTokens) return b.maxTokens - a.maxTokens;
        if (a.isGlobal !== b.isGlobal) return a.isGlobal ? -1 : 1;
        return a.descricao.localeCompare(b.descricao);
      });

      const regraVencedora = matches[0];
      const categoriaDestino = regraVencedora.regra.categoria_destino.toLowerCase();

      if (item.categoria === categoriaDestino) {
        orfaosJaCorretos++;
        continue;
      }

      console.log(`🔄 Órfão: ${nomeProduto} | ${item.categoria} → ${categoriaDestino}`);

      const { error: updateOrfaoError } = await supabase
        .from('estoque_app')
        .update({
          categoria: categoriaDestino,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (updateOrfaoError) {
        console.error(`❌ Erro ao atualizar órfão ${nomeProduto}:`, updateOrfaoError.message);
        mudancas.push({
          produto_nome: nomeProduto,
          categoria_anterior: item.categoria,
          categoria_nova: categoriaDestino,
          razao: `[órfão] ${regraVencedora.regra.descricao}`,
          status: 'erro'
        });
        continue;
      }

      orfaosAlterados++;
      mudancas.push({
        produto_nome: nomeProduto,
        categoria_anterior: item.categoria,
        categoria_nova: categoriaDestino,
        razao: `[órfão] ${regraVencedora.regra.descricao}`,
        status: 'sucesso',
        propagados_estoque: 0,
      });
    }

    const resultado = {
      sucesso: true,
      produtos_master_analisados: (produtos || []).length,
      produtos_alterados: produtosAlterados,
      produtos_ja_corretos: produtosJaCorretos,
      produtos_ignorados: produtosIgnorados,
      produtos_com_conflito: produtosComConflito,
      conflitos_detectados: conflitos,
      mudancas,
      estoque_propagados: estoquePropagados,
      orfaos_analisados: (itensOrfaos || []).length,
      orfaos_alterados: orfaosAlterados,
      orfaos_ja_corretos: orfaosJaCorretos,
      orfaos_ignorados: orfaosIgnorados,
      timestamp: new Date().toISOString()
    };

    console.log('📊 Resultado da recategorização master:');
    console.log(`   Master analisados: ${resultado.produtos_master_analisados}`);
    console.log(`   Alterados: ${resultado.produtos_alterados}`);
    console.log(`   Já corretos: ${resultado.produtos_ja_corretos}`);
    console.log(`   Ignorados (sem match): ${resultado.produtos_ignorados}`);
    console.log(`   Com conflito: ${resultado.produtos_com_conflito}`);
    console.log(`   Estoque propagados: ${resultado.estoque_propagados}`);
    console.log(`   Conflitos: ${conflitos.length}`);
    console.log('📊 Resultado órfãos:');
    console.log(`   Órfãos analisados: ${resultado.orfaos_analisados}`);
    console.log(`   Órfãos alterados: ${resultado.orfaos_alterados}`);
    console.log(`   Órfãos já corretos: ${resultado.orfaos_ja_corretos}`);
    console.log(`   Órfãos ignorados: ${resultado.orfaos_ignorados}`);

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('❌ Erro na recategorização:', error);
    return new Response(
      JSON.stringify({
        sucesso: false,
        erro: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
