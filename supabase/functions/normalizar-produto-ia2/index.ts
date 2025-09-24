import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuração Supabase
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar se há body na requisição
    const contentType = req.headers.get('content-type');
    let requestBody = {};
    
    if (contentType && contentType.includes('application/json')) {
      const text = await req.text();
      if (text && text.trim()) {
        try {
          requestBody = JSON.parse(text);
        } catch (parseError) {
          console.error('❌ Erro ao fazer parse do JSON:', parseError);
          console.log('📝 Texto recebido:', text);
          return new Response(JSON.stringify({ 
            error: 'JSON inválido na requisição',
            details: parseError.message 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }
    
    const { nomeOriginal, notaId, usuarioId, debug } = requestBody;
    
    console.log('📝 Parâmetros recebidos:', requestBody);
    
    if (!nomeOriginal && !notaId) {
      return new Response(
        JSON.stringify({ error: 'nomeOriginal ou notaId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🧠 IA-2 INICIADA: Normalizando produto com IA avançada');
    
    if (debug) {
      console.log('🔍 Debug mode ativado');
      console.log('Parâmetros:', { nomeOriginal, notaId, usuarioId });
    }

    // ========= FLUXO PARA PROCESSAR NOTA COMPLETA =========
    if (notaId) {
      console.log('📋 PROCESSANDO NOTA COMPLETA:', notaId);
      
      // Buscar nota e seus dados
      const { data: nota, error: notaError } = await supabase
        .from('notas_imagens')
        .select('*')
        .eq('id', notaId)
        .single();

      if (notaError || !nota) {
        return new Response(
          JSON.stringify({ error: 'Nota não encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!nota.dados_extraidos?.itens) {
        return new Response(
          JSON.stringify({ error: 'Nota não possui itens extraídos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ⚠️ PULAR process-receipt-full - assumir que já foi processado
      console.log('🔄 Assumindo que a nota já foi processada no estoque...');
      
      // Verificar se já existe no estoque
      const { data: estoqueItems, error: estoqueError } = await supabase
        .from('estoque_app')
        .select('id')
        .eq('nota_id', notaId)
        .limit(1);
      
      if (estoqueError) {
        console.error('❌ Erro ao verificar estoque:', estoqueError);
      } else if (!estoqueItems || estoqueItems.length === 0) {
        console.log('⚠️ Estoque vazio para esta nota - processando primeiro...');
        
        const { data: processResult, error: processError } = await supabase.functions.invoke('process-receipt-full', {
          body: { notaId: notaId }
        });

        if (processError || !processResult?.success) {
          console.error('❌ Erro no process-receipt-full:', processError);
          return new Response(
            JSON.stringify({ 
              error: 'Erro ao processar nota no estoque',
              details: processError?.message || processResult?.error 
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log('✅ Nota processada no estoque:', processResult.itens_inseridos, 'itens');
      } else {
        console.log('✅ Nota já existe no estoque, prosseguindo com normalização...');
      }

      // Processar normalização diretamente aqui para evitar recursão
      const itens = nota.dados_extraidos.itens;
      let itensNormalizados = 0;
      let propostas = 0;

      for (const item of itens) {
        if (!item.descricao || item.descricao.trim() === '') continue;

        console.log(`📝 Normalizando: ${item.descricao}`);
        
        try {
          // Processar normalização diretamente aqui
          const resultado = await processarNormalizacaoItem(item.descricao, usuarioId || nota.usuario_id);
          
          if (resultado.acao === 'aceito_automatico') {
            itensNormalizados++;
          } else if (resultado.acao === 'enviado_revisao') {
            propostas++;
          }
        } catch (err) {
          console.error(`❌ Erro ao normalizar ${item.descricao}:`, err);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          nota_processada: true,
          itens_processados: itens.length,
          itens_inseridos_estoque: itens.length,
          itens_normalizados: itensNormalizados,
          propostas_criadas: propostas,
          total_financeiro: itens.reduce((sum, item) => sum + (parseFloat(item.valor_total) || 0), 0)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========= FLUXO PARA PRODUTO INDIVIDUAL =========
    const resultado = await processarNormalizacaoItem(nomeOriginal, usuarioId);
    
    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na IA-2:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// FUNÇÃO AUXILIAR PARA PROCESSAR NORMALIZAÇÃO
async function processarNormalizacaoItem(nomeOriginal: string, usuarioId?: string) {
  console.log('📝 Produto original:', nomeOriginal);

  // 1. NORMALIZAÇÃO BÁSICA DO TEXTO
  let nomeNormalizado = nomeOriginal.toUpperCase().trim();
  
  // Aplicar normalizações da tabela normalizacoes_nomes
  const { data: normalizacoes } = await supabase
    .from('normalizacoes_nomes')
    .select('termo_errado, termo_correto')
    .eq('ativo', true);
  
  if (normalizacoes) {
    for (const norm of normalizacoes) {
      const regex = new RegExp(`\\b${norm.termo_errado}\\b`, 'gi');
      nomeNormalizado = nomeNormalizado.replace(regex, norm.termo_correto);
    }
  }

  // Normalizações específicas de padrões
  nomeNormalizado = nomeNormalizado
    .replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b/gi, 'PAO DE FORMA')
    .replace(/\b(ACHOCOLATADO EM PO NESCAU)\s*(\d+G|3\.0|30KG)?\b/gi, 'ACHOCOLATADO EM PO')
    .replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL|\d+G|\d+ML|\d+L|\d+KG)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('🔄 Nome normalizado:', nomeNormalizado);

  // 2. BUSCAR PRODUTOS EXISTENTES SIMILARES
  const { data: produtosExistentes } = await supabase
    .from('produtos_normalizados')
    .select('*')
    .eq('ativo', true)
    .limit(50);

  // 3. CALCULAR SCORES DE SIMILARIDADE
  let melhorCandidato = null;
  let scoreSimilaridade = 0;
  let candidatos = [];

  if (produtosExistentes) {
    for (const produto of produtosExistentes) {
      // Score baseado em similaridade de texto
      const similarity = calcularSimilaridade(nomeNormalizado, produto.nome_normalizado || produto.nome_padrao);
      
      if (similarity > 0.7) {
        candidatos.push({
          id: produto.id,
          nome: produto.nome_padrao,
          categoria: produto.categoria,
          marca: produto.marca,
          score: similarity,
          provisorio: produto.provisorio
        });
      }

      if (similarity > scoreSimilaridade) {
        scoreSimilaridade = similarity;
        melhorCandidato = produto;
      }
    }
  }

  // Ordenar candidatos por score
  candidatos.sort((a, b) => b.score - a.score);

  // 4. EXTRAÇÃO DE INFORMAÇÕES DO PRODUTO
  const infoExtraida = extrairInformacoesProduto(nomeNormalizado);
  
  // 5. DETERMINAR NÍVEL DE CONFIANÇA
  let confianca = calcularConfianca(scoreSimilaridade, candidatos, infoExtraida, nomeNormalizado);
  
  console.log('📊 Score melhor candidato:', scoreSimilaridade);
  console.log('📊 Confiança calculada:', confianca);
  console.log('🎯 Candidatos encontrados:', candidatos.length);

  // 6. DECISÃO BASEADA NA CONFIANÇA
  const LIMITE_CONFIANCA_ALTA = 0.9;
  
  if (confianca >= LIMITE_CONFIANCA_ALTA && melhorCandidato) {
    // ALTA CONFIANÇA - INSERIR AUTOMATICAMENTE
    console.log('✅ ALTA CONFIANÇA - Inserindo automaticamente');
    
    const produtoNormalizado = {
      produto_nome_normalizado: melhorCandidato.nome_normalizado || melhorCandidato.nome_padrao,
      nome_base: melhorCandidato.nome_padrao,
      marca: melhorCandidato.marca,
      categoria: melhorCandidato.categoria,
      tipo_embalagem: infoExtraida.tipo_embalagem,
      qtd_valor: infoExtraida.qtd_valor,
      qtd_unidade: infoExtraida.qtd_unidade,
      granel: infoExtraida.granel,
      produto_hash_normalizado: gerarHash(melhorCandidato.nome_padrao)
    };

    // Log da normalização
    await supabase
      .from('normalizacoes_log')
      .insert({
        texto_origem: nomeOriginal,
        acao: 'aceito_automatico',
        produto_id: melhorCandidato.id,
        score_fuzzy: scoreSimilaridade,
        score_agregado: confianca,
        candidatos: candidatos.slice(0, 5),
        user_id: usuarioId,
        metadata: { fonte: 'ia2_auto', info_extraida: infoExtraida }
      });

    return { 
      success: true,
      produto_normalizado: produtoNormalizado,
      acao: 'aceito_automatico',
      confianca: confianca,
      candidato_escolhido: melhorCandidato.nome_padrao
    };
    
  } else {
    // BAIXA CONFIANÇA - CRIAR PROPOSTA PARA REVISÃO
    console.log('⚠️ BAIXA CONFIANÇA - Criando proposta para revisão');
    
    // Preparar novo produto sugerido
    const novoProdutoSugerido = {
      nome_padrao: nomeNormalizado,
      nome_normalizado: nomeNormalizado,
      categoria: infoExtraida.categoria || 'indefinida',
      marca: infoExtraida.marca,
      tipo_embalagem: infoExtraida.tipo_embalagem,
      qtd_valor: infoExtraida.qtd_valor,
      qtd_unidade: infoExtraida.qtd_unidade,
      granel: infoExtraida.granel,
      unidade_medida: 'unidade',
      provisorio: true
    };

    // Criar proposta de revisão
    const { data: proposta, error: propostaError } = await supabase
      .from('propostas_revisao')
      .insert({
        texto_origem: nomeOriginal,
        candidatos: candidatos.slice(0, 10),
        score_melhor: scoreSimilaridade,
        produto_escolhido_id: melhorCandidato?.id,
        novo_produto: novoProdutoSugerido,
        fonte: 'ia2_revisao',
        status: 'pendente'
      })
      .select()
      .single();

    if (propostaError) {
      console.error('❌ Erro ao criar proposta:', propostaError);
    } else {
      console.log('📝 Proposta criada:', proposta.id);
    }

    // Log da normalização
    await supabase
      .from('normalizacoes_log')
      .insert({
        texto_origem: nomeOriginal,
        acao: 'enviado_revisao',
        produto_id: melhorCandidato?.id,
        score_fuzzy: scoreSimilaridade,
        score_agregado: confianca,
        candidatos: candidatos.slice(0, 5),
        user_id: usuarioId,
        metadata: { 
          fonte: 'ia2_revisao', 
          info_extraida: infoExtraida,
          proposta_id: proposta?.id
        }
      });

    // Por enquanto, inserir produto provisório para não travar o fluxo
    const produtoProvisorio = {
      produto_nome_normalizado: nomeNormalizado,
      nome_base: nomeNormalizado,
      marca: infoExtraida.marca,
      categoria: infoExtraida.categoria || 'indefinida',
      tipo_embalagem: infoExtraida.tipo_embalagem,
      qtd_valor: infoExtraida.qtd_valor,
      qtd_unidade: infoExtraida.qtd_unidade,
      granel: infoExtraida.granel,
      produto_hash_normalizado: gerarHash(nomeNormalizado + '_PROVISORIO')
    };

    return { 
      success: true,
      produto_normalizado: produtoProvisorio,
      acao: 'enviado_revisao',
      confianca: confianca,
      proposta_criada: true,
      candidatos_encontrados: candidatos.length,
      melhor_score: scoreSimilaridade
    };
  }
}

// FUNÇÕES AUXILIARES
function calcularSimilaridade(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Similaridade exata
  if (s1 === s2) return 1.0;
  
  // Similaridade por inclusão
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Similaridade por palavras
  const palavras1 = s1.split(' ');
  const palavras2 = s2.split(' ');
  
  let palavrasComuns = 0;
  for (const palavra1 of palavras1) {
    if (palavra1.length > 2) {
      for (const palavra2 of palavras2) {
        if (palavra1 === palavra2) {
          palavrasComuns++;
          break;
        }
      }
    }
  }
  
  const totalPalavras = Math.max(palavras1.length, palavras2.length);
  return palavrasComuns / totalPalavras;
}

function extrairInformacoesProduto(nome: string) {
  const info = {
    marca: null as string | null,
    categoria: null as string | null,
    tipo_embalagem: null as string | null,
    qtd_valor: null as number | null,
    qtd_unidade: null as string | null,
    granel: false
  };
  
  // Detectar se é granel
  if (/\b(GRANEL|GRAENC)\b/i.test(nome)) {
    info.granel = true;
  }
  
  // Extrair quantidade e unidade
  const matchQtd = nome.match(/(\d+)\s*(G|ML|L|KG|UN|UNIDADES?)\b/i);
  if (matchQtd) {
    info.qtd_valor = parseInt(matchQtd[1]);
    info.qtd_unidade = matchQtd[2].toUpperCase();
  }
  
  // Detectar marcas conhecidas
  const marcas = ['COCA COLA', 'PEPSI', 'NESCAU', 'NESTLE', 'UNILEVER', 'JOHNSON', 'COLGATE'];
  for (const marca of marcas) {
    if (nome.includes(marca)) {
      info.marca = marca;
      break;
    }
  }
  
  // Categorização básica por palavras-chave
  if (/\b(REFRIGERANTE|COCA|PEPSI|GUARANA)\b/i.test(nome)) {
    info.categoria = 'bebidas';
  } else if (/\b(PAO|BISCOITO|BOLACHA)\b/i.test(nome)) {
    info.categoria = 'padaria';
  } else if (/\b(LEITE|IOGURTE|QUEIJO|MANTEIGA)\b/i.test(nome)) {
    info.categoria = 'laticinios';
  } else if (/\b(ARROZ|FEIJAO|MACARRAO|OLEO)\b/i.test(nome)) {
    info.categoria = 'mercearia';
  } else if (/\b(CARNE|FRANGO|PEIXE|LINGUICA)\b/i.test(nome)) {
    info.categoria = 'carnes';
  } else if (/\b(BANANA|MACA|LARANJA|TOMATE|ALFACE)\b/i.test(nome)) {
    info.categoria = 'hortifruti';
  }
  
  return info;
}

function calcularConfianca(scoreSimilaridade: number, candidatos: any[], infoExtraida: any, nomeOriginal: string): number {
  let confianca = scoreSimilaridade;
  
  // Bônus se há candidatos claros
  if (candidatos.length > 0 && candidatos[0].score > 0.95) {
    confianca += 0.1;
  }
  
  // Penalidade se há muitos candidatos similares
  if (candidatos.length > 5) {
    confianca -= 0.1;
  }
  
  // Bônus se marca foi identificada
  if (infoExtraida.marca) {
    confianca += 0.05;
  }
  
  // Bônus se categoria foi identificada
  if (infoExtraida.categoria) {
    confianca += 0.05;
  }
  
  // Penalidade para nomes muito curtos ou genéricos
  if (nomeOriginal.length < 10) {
    confianca -= 0.1;
  }
  
  return Math.min(1.0, Math.max(0.0, confianca));
}

function gerarHash(texto: string): string {
  // Simples hash baseado no texto
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    const char = texto.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}