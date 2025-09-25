import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Funções de limpeza e normalização de texto
function limparTextoBasico(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s\d]/g, ' ') // remove caracteres especiais
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarUnidades(texto: string): string {
  return texto
    .replace(/\b(gr|gramas?|g)\b/gi, 'g')
    .replace(/\b(kg|quilos?|kilos?)\b/gi, 'kg')
    .replace(/\b(ml|mililitros?)\b/gi, 'ml')
    .replace(/\b(l|litros?)\b/gi, 'l')
    .replace(/\b(un|unidade|unidades)\b/gi, 'un');
}

function extrairEstrutura(texto: string): {
  marca?: string;
  quantidade?: number;
  unidade?: string;
  conteudo?: string;
} {
  const resultado: any = {};
  
  // Extrair quantidade e unidade (ex: "200g", "1.5l", "500ml")
  const regexQuantidade = /(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|un)/gi;
  const matchQuantidade = regexQuantidade.exec(texto);
  
  if (matchQuantidade) {
    resultado.quantidade = parseFloat(matchQuantidade[1].replace(',', '.'));
    resultado.unidade = matchQuantidade[2].toLowerCase();
  }
  
  // Marcas conhecidas (expandir conforme necessário)
  const marcas = ['italac', 'nestle', 'coca-cola', 'seara', 'sadia', 'perdigao', 'leao', 'matte', 'tirolez', 'bombril', 'omo', 'ariel'];
  for (const marca of marcas) {
    if (texto.toLowerCase().includes(marca)) {
      resultado.marca = marca;
      break;
    }
  }
  
  return resultado;
}

async function gerarEmbedding(texto: string): Promise<number[]> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key não configurada');
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texto,
        dimensions: 384 // Compatível com nosso schema
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Erro na API OpenAI: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Erro ao gerar embedding:', error);
    throw error;
  }
}

async function buscarCandidatos(supabase: any, textoLimpo: string, embedding: number[]) {
  const candidatos = [];
  
  // 1. Busca por embedding similarity (top 5)
  if (embedding) {
    try {
      const { data: embeddingCandidatos, error } = await supabase
        .from('produtos_normalizados')
        .select('id, sku, nome_normalizado, marca, categoria, variante, embedding')
        .filter('embedding', 'not.is', null)
        .rpc('vector_similarity_search', {
          query_embedding: JSON.stringify(embedding),
          similarity_threshold: 0.3,
          match_count: 5
        });
      
      if (!error && embeddingCandidatos) {
        for (const candidato of embeddingCandidatos) {
          candidatos.push({
            ...candidato,
            score_embedding: candidato.similarity,
            score_fuzzy: 0,
            score_agregado: candidato.similarity
          });
        }
      }
    } catch (error) {
      console.error('Erro na busca por embedding:', error);
    }
  }
  
  // 2. Busca fuzzy text (trigram)
  try {
    const { data: fuzzyData, error: fuzzyError } = await supabase
      .from('produtos_normalizados')
      .select('id, sku, nome_normalizado, marca, categoria, variante')
      .textSearch('nome_normalizado', textoLimpo.split(' ').join(' | '), {
        type: 'websearch'
      })
      .limit(5);
    
    if (!fuzzyError && fuzzyData) {
      for (const candidato of fuzzyData) {
        const similarity = await supabase
          .rpc('similarity', { text1: textoLimpo, text2: candidato.nome_normalizado });
        
        if (similarity.data > 0.3) {
          const existente = candidatos.find(c => c.id === candidato.id);
          if (existente) {
            existente.score_fuzzy = similarity.data;
            existente.score_agregado = Math.max(existente.score_embedding || 0, similarity.data);
          } else {
            candidatos.push({
              ...candidato,
              score_embedding: 0,
              score_fuzzy: similarity.data,
              score_agregado: similarity.data
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro na busca fuzzy:', error);
  }
  
  // 3. Busca em sinônimos
  try {
    const { data: sinonimos, error: sinError } = await supabase
      .from('sinonimos_produtos')
      .select(`
        id, texto_origem, confianca,
        produtos_normalizados(id, sku, nome_normalizado, marca, categoria, variante)
      `)
      .ilike('texto_origem', `%${textoLimpo}%`)
      .limit(3);
    
    if (!sinError && sinonimos) {
      for (const sinonimo of sinonimos) {
        const produto = sinonimo.produtos_normalizados;
        const existente = candidatos.find(c => c.id === produto.id);
        const scoreExato = 1.0; // Match exato em sinônimo
        
        if (existente) {
          existente.score_agregado = Math.max(existente.score_agregado, scoreExato);
        } else {
          candidatos.push({
            ...produto,
            score_embedding: 0,
            score_fuzzy: 0,
            score_agregado: scoreExato,
            fonte_match: 'sinonimo'
          });
        }
      }
    }
  } catch (error) {
    console.error('Erro na busca por sinônimos:', error);
  }
  
  // Ordenar por score e remover duplicatas
  return candidatos
    .sort((a, b) => b.score_agregado - a.score_agregado)
    .slice(0, 10);
}

async function criarLogNormalizacao(
  supabase: any, 
  textoOrigem: string, 
  produtoId: string | null, 
  acao: string, 
  scores: any, 
  candidatos: any[], 
  metadata: any = {}
) {
  try {
    await supabase
      .from('normalizacoes_log')
      .insert({
        texto_origem: textoOrigem,
        produto_id: produtoId,
        acao,
        score_embedding: scores.embedding || null,
        score_fuzzy: scores.fuzzy || null,
        score_agregado: scores.agregado || null,
        candidatos: candidatos,
        metadata: {
          timestamp: new Date().toISOString(),
          tempo_processamento_ms: metadata.tempoProcessamento,
          ...metadata
        }
      });
  } catch (error) {
    console.error('Erro ao criar log:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { texto_origem, fonte, meta } = await req.json();
    
    if (!texto_origem) {
      return new Response(
        JSON.stringify({ error: 'texto_origem é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`🔍 Normalizando produto: "${texto_origem}"`);
    
    // 1. Limpeza e normalização básica
    const textoLimpo = normalizarUnidades(limparTextoBasico(texto_origem));
    console.log(`📝 Texto limpo: "${textoLimpo}"`);
    
    // 2. Extrair estrutura
    const estrutura = extrairEstrutura(texto_origem);
    console.log(`🏗️ Estrutura extraída:`, estrutura);
    
    // 3. Gerar embedding
    let embedding: number[] | null = null;
    try {
      embedding = await gerarEmbedding(textoLimpo);
      console.log(`🧠 Embedding gerado: ${embedding.length} dimensões`);
    } catch (error) {
      console.warn('⚠️ Erro ao gerar embedding, continuando sem:', error instanceof Error ? error.message : String(error));
    }
    
    // 4. Buscar candidatos
    const candidatos = await buscarCandidatos(supabase, textoLimpo, embedding || []);
    console.log(`🎯 ${candidatos.length} candidatos encontrados`);
    
    // 5. Decisão baseada no melhor score
    const melhorCandidato = candidatos[0];
    const scoreDecisao = melhorCandidato?.score_agregado || 0;
    
    const tempoProcessamento = Date.now() - startTime;
    
    let resultado: any;
    
    if (scoreDecisao >= 0.90) {
      // AUTO-ASSOCIAÇÃO (alta confiança)
      resultado = {
        sku: melhorCandidato.sku,
        produto_id: melhorCandidato.id,
        acao: 'auto_associado',
        score: scoreDecisao,
        candidatos: candidatos.slice(0, 3),
        confianca: 'alta'
      };
      
      // Criar sinônimo automático
      await supabase
        .from('sinonimos_produtos')
        .insert({
          produto_id: melhorCandidato.id,
          texto_origem: texto_origem,
          fonte: fonte || 'api',
          confianca: scoreDecisao,
          metodo_criacao: 'automatico'
        });
      
      await criarLogNormalizacao(
        supabase, texto_origem, melhorCandidato.id, 'auto_associado',
        { agregado: scoreDecisao }, candidatos, { tempoProcessamento }
      );
      
    } else if (scoreDecisao >= 0.75) {
      // PROPOSTA PARA REVISÃO (confiança média)
      const { data: proposta } = await supabase
        .from('propostas_revisao')
        .insert({
          texto_origem: texto_origem,
          fonte: fonte || 'api',
          candidatos: candidatos.slice(0, 5),
          score_melhor: scoreDecisao
        })
        .select()
        .single();
      
      resultado = {
        sku: null,
        produto_id: null,
        acao: 'proposto',
        score: scoreDecisao,
        candidatos: candidatos.slice(0, 5),
        proposta_id: proposta?.id,
        confianca: 'media'
      };
      
      await criarLogNormalizacao(
        supabase, texto_origem, null, 'proposto',
        { agregado: scoreDecisao }, candidatos, { tempoProcessamento, proposta_id: proposta?.id }
      );
      
    } else {
      // CRIAR NOVO PRODUTO PROVISÓRIO (baixa confiança)
      const novoSku = `SKU-${Date.now().toString(36).toUpperCase()}`;
      
      const { data: novoProduto } = await supabase
        .from('produtos_normalizados')
        .insert({
          sku: novoSku,
          nome_normalizado: textoLimpo,
          marca: estrutura.marca,
          categoria: 'outros',
          variante: estrutura.quantidade && estrutura.unidade ? `${estrutura.quantidade}${estrutura.unidade}` : null,
          embedding: embedding,
          provisorio: true
        })
        .select()
        .single();
      
      // Criar sinônimo para o novo produto
      await supabase
        .from('sinonimos_produtos')
        .insert({
          produto_id: novoProduto.id,
          texto_origem: texto_origem,
          fonte: fonte || 'api',
          confianca: 0.5,
          metodo_criacao: 'automatico'
        });
      
      resultado = {
        sku: novoSku,
        produto_id: novoProduto?.id,
        acao: 'novo_provisorio',
        score: scoreDecisao,
        candidatos: candidatos.slice(0, 3),
        confianca: 'baixa'
      };
      
      await criarLogNormalizacao(
        supabase, texto_origem, novoProduto?.id, 'novo_provisorio',
        { agregado: scoreDecisao }, candidatos, { tempoProcessamento }
      );
    }
    
    console.log(`✅ Normalização concluída em ${tempoProcessamento}ms - ${resultado.acao}`);
    
    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('❌ Erro na normalização:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno na normalização',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});