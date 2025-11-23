import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 🥚 Detectar quantidade em embalagem para produtos multi-unidade (ex: ovos)
function detectarQuantidadeEmbalagem(nomeProduto: string): { 
  isMultiUnit: boolean; 
  quantity: number;
} {
  const nomeUpper = nomeProduto.toUpperCase();
  
  // Verificar se é produto de ovos
  const isOvo = /\b(OVO|OVOS)\b/.test(nomeUpper) && 
                !/\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b/.test(nomeUpper);
  
  if (!isOvo) {
    return { isMultiUnit: false, quantity: 1 };
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
        console.log(`🥚 OVOS DETECTADO NA NORMALIZAÇÃO: "${nomeProduto}" → ${qty} unidades`);
        return { isMultiUnit: true, quantity: qty };
      }
    }
  }
  
  // Não encontrou quantidade específica, assumir 1
  return { isMultiUnit: false, quantity: 1 };
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

  try {
    console.log('🚀 Iniciando processamento de normalização global');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. BUSCAR PRODUTOS DE NOTAS NÃO NORMALIZADAS
    console.log('📋 Buscando produtos para normalizar...');
    
    const { data: notasProcessadas, error: notasError } = await supabase
      .from('notas_imagens')
      .select('id, usuario_id, dados_extraidos')
      .eq('processada', true)
      .eq('normalizada', false)
      .not('dados_extraidos', 'is', null)
      .limit(1); // ✅ Reduzido para 1 nota por execução para evitar timeout

    if (notasError) {
      throw new Error(`Erro ao buscar notas: ${notasError.message}`);
    }

    console.log(`📦 Notas fiscais: ${notasProcessadas?.length || 0} notas processadas`);

    // 2. BUSCAR PRODUTOS DO OPEN FOOD FACTS NÃO NORMALIZADOS
    const { data: openFoodProducts, error: offError } = await supabase
      .from('open_food_facts_staging')
      .select('id, codigo_barras, texto_original, dados_brutos, imagem_url, imagem_path')
      .eq('processada', false)
      .limit(100);

    if (offError) {
      console.warn(`⚠️ Erro ao buscar Open Food Facts: ${offError.message}`);
    }

    console.log(`🌍 Open Food Facts: ${openFoodProducts?.length || 0} produtos para normalizar`);

    const produtosParaNormalizar: ProdutoParaNormalizar[] = [];

    // Extrair produtos de cada nota fiscal com hash único por item
    const notasIds: string[] = [];
    const notasMetadata = new Map<string, { totalItens: number, itensProcessados: number }>();
    
    for (const nota of notasProcessadas || []) {
      const itens = nota.dados_extraidos?.itens || [];
      notasMetadata.set(nota.id, { totalItens: itens.length, itensProcessados: 0 });
      
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const descricao = item.descricao || item.nome;
        if (descricao) {
          // Criar hash único para este item desta nota
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

    console.log(`📊 Encontrados ${produtosParaNormalizar.length} produtos para processar`);

    // ✅ VALIDAÇÃO: Retornar early se não houver produtos novos
    if (produtosParaNormalizar.length === 0) {
      console.log('ℹ️ Nenhum produto novo para processar');
      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: 'Nenhum produto novo para processar',
          total_produtos: 0,
          processados: 0,
          auto_aprovados: 0,
          para_revisao: 0,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. PROCESSAR EM LOTES
    const LOTE_SIZE = 10;
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
          const embalagemInfo = detectarQuantidadeEmbalagem(produto.texto_original);

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
            .select('id, status, sugestao_produto_master, sugestao_sku_global, nome_padrao_sugerido, marca_sugerida, nome_base_sugerido, categoria_sugerida')
            .eq('nota_item_hash', produto.nota_item_hash)
            .maybeSingle();

          if (jaExiste) {
            console.log(`⏭️  Produto já tem candidato: ${produto.texto_original} (status: ${jaExiste.status})`);
            
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
              embalagemInfo
            );

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
              // Produto novo com alta confiança - criar master e auto-aprovar
              while (tentativas < MAX_TENTATIVAS) {
                try {
                  const masterCriado = await criarProdutoMaster(supabase, normalizacao);
                  normalizacao.produto_master_id = masterCriado.id; // ✅ Preencher o ID do master criado
                  console.log(`🔗 Master criado e vinculado: ${masterCriado.id}`);
                  await criarCandidato(supabase, produto, normalizacao, 'auto_aprovado', obsEmbalagem);
                  break;
                } catch (erro: any) {
                  tentativas++;
                  if (tentativas >= MAX_TENTATIVAS) throw erro;
                  await new Promise(r => setTimeout(r, 1000 * tentativas));
                }
              }
              
              totalAutoAprovados++;
              console.log(`✅ Auto-aprovado pela IA (produto novo ${normalizacao.confianca}%): ${normalizacao.nome_padrao}`);
              
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

    // 🔒 VALIDAÇÃO ATÔMICA: Só marca nota como normalizada se TODOS os itens foram processados
    let notasMarcadasComSucesso = 0;
    let notasFalharam = 0;
    let notasParciaisReprocessar = 0;
    
    console.log(`\n📝 Validando processamento de ${notasIds.length} notas...`);
    
    if (notasIds.length > 0) {
      for (const notaId of notasIds) {
        try {
          const metadata = notasMetadata.get(notaId);
          if (!metadata) {
            console.warn(`⚠️ Metadata não encontrado para nota ${notaId}`);
            continue;
          }
          
          const { totalItens, itensProcessados } = metadata;
          
          // ✅ VALIDAÇÃO: Contar candidatos criados
          const { count: candidatosCriados } = await supabase
            .from('produtos_candidatos_normalizacao')
            .select('*', { count: 'exact', head: true })
            .eq('nota_imagem_id', notaId);
          
          console.log(`📊 Nota ${notaId}: ${candidatosCriados}/${totalItens} candidatos criados`);
          
          // ✅ SÓ MARCA COMO NORMALIZADA SE 100% DOS ITENS VIRARAM CANDIDATOS
          if (candidatosCriados === totalItens && itensProcessados === totalItens) {
            const { error: updateError } = await supabase
              .from('notas_imagens')
              .update({ 
                normalizada: true,
                normalizada_em: new Date().toISOString(),
                produtos_normalizados: totalItens,
                tentativas_normalizacao: (await supabase
                  .from('notas_imagens')
                  .select('tentativas_normalizacao')
                  .eq('id', notaId)
                  .single()
                ).data?.tentativas_normalizacao || 0 + 1
              })
              .eq('id', notaId);
            
            if (updateError) {
              console.error(`❌ Erro ao marcar nota ${notaId}:`, updateError.message);
              notasFalharam++;
            } else {
              console.log(`✅ Nota ${notaId} marcada como normalizada (${totalItens} produtos)`);
              notasMarcadasComSucesso++;
            }
          } else {
            // ⚠️ PROCESSAMENTO PARCIAL - NÃO MARCAR
            console.warn(`⚠️ Nota ${notaId} INCOMPLETA: ${candidatosCriados}/${totalItens} - NÃO marcada (será reprocessada)`);
            
            // Incrementar tentativas
            await supabase
              .from('notas_imagens')
              .update({ 
                tentativas_normalizacao: (await supabase
                  .from('notas_imagens')
                  .select('tentativas_normalizacao')
                  .eq('id', notaId)
                  .single()
                ).data?.tentativas_normalizacao || 0 + 1
              })
              .eq('id', notaId);
            
            notasParciaisReprocessar++;
          }
          
        } catch (error: any) {
          console.error(`❌ Exceção ao validar nota ${notaId}:`, error.message);
          notasFalharam++;
        }
      }
    } else {
      console.log('ℹ️ Nenhuma nota para marcar');
    }

    const resultado = {
      sucesso: true,
      total_produtos: produtosParaNormalizar.length,
      processados: totalProcessados,
      auto_aprovados: totalAutoAprovados,
      para_revisao: totalParaRevisao,
      notas_processadas: notasIds.length,
      notas_marcadas_completas: notasMarcadasComSucesso,
      notas_parciais_reprocessar: notasParciaisReprocessar,
      notas_falharam: notasFalharam,
      garantia_atomica: notasParciaisReprocessar === 0 ? '✅ TODAS COMPLETAS' : '⚠️ REPROCESSAMENTO NECESSÁRIO',
      timestamp: new Date().toISOString()
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
  
  // Remover pontuações problemáticas que atrapalham o matching
  normalizado = normalizado
    .replace(/\./g, ' ')  // Pontos viram espaços
    .replace(/,/g, ' ')   // Vírgulas viram espaços
    .replace(/\(/g, ' ')
    .replace(/\)/g, ' ')
    .replace(/\s+/g, ' ') // Normalizar múltiplos espaços
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
  
  if (sinonimo?.produtos_master_global) {
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

  if (similares && similares.length > 0) {
    const melhorMatch = similares[0];
    
    // 🔧 MATCHING INTELIGENTE: Se marca e peso batem, ser mais tolerante com similaridade
    let limiarAceitacao = 0.80; // Padrão: 80%
    
    if (marcaExtraida && pesoExtraido) {
      // Verificar se o melhor match tem marca e peso compatíveis
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
      console.log(`✅ Match fuzzy forte: ${melhorMatch.sku_global} (${(melhorMatch.similarity * 100).toFixed(0)}%)`);
      return {
        encontrado: true,
        produto: melhorMatch,
        metodo: 'fuzzy_forte',
        confianca: melhorMatch.similarity * 100
      };
    }

    // Se > 60%, enviar top candidatos para IA decidir
    if (melhorMatch.similarity > 0.6) {
      console.log(`📋 ${similares.length} candidatos fuzzy encontrados para IA avaliar`);
      return {
        encontrado: false,
        candidatos: similares.slice(0, 10),
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
  embalagemInfo?: { isMultiUnit: boolean; quantity: number }
): Promise<NormalizacaoSugerida> {
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
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'Você é um especialista em normalização de produtos. Sempre responda com JSON válido, sem markdown.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API Lovable AI: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const conteudo = data.choices[0].message.content;
    
    const jsonLimpo = conteudo
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const resultado = JSON.parse(jsonLimpo);
    
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
    console.error('❌ Erro ao chamar Lovable AI:', error);
    return {
      sku_global: `TEMP-${Date.now()}`,
      nome_padrao: textoOriginal.toUpperCase(),
      categoria: 'OUTROS',
      nome_base: textoOriginal.toUpperCase(),
      marca: null,
      tipo_embalagem: null,
      qtd_valor: null,
      qtd_unidade: null,
      qtd_base: null,
      unidade_base: null,
      categoria_unidade: null,
      granel: false,
      confianca: 30,
      razao: `Erro na IA: ${error.message}`,
      produto_master_id: null
    };
  }
}

async function criarProdutoMaster(
  supabase: any,
  normalizacao: NormalizacaoSugerida
): Promise<{ id: string, nome_padrao: string }> {
  // 🔥 Chamada SQL usando INSERT direto para evitar conflito de ordem de parâmetros
  const { data, error } = await supabase
    .from('produtos_master_global')
    .upsert({
      sku_global: normalizacao.sku_global,
      nome_padrao: normalizacao.nome_padrao,
      nome_base: normalizacao.nome_base,
      categoria: normalizacao.categoria,
      qtd_valor: normalizacao.qtd_valor,
      qtd_unidade: normalizacao.qtd_unidade,
      qtd_base: normalizacao.qtd_base,
      unidade_base: normalizacao.unidade_base,
      categoria_unidade: normalizacao.categoria_unidade,
      granel: normalizacao.granel,
      marca: normalizacao.marca,
      tipo_embalagem: normalizacao.tipo_embalagem,
      imagem_url: normalizacao.imagem_url || null,
      imagem_path: normalizacao.imagem_path || null,
      confianca_normalizacao: normalizacao.confianca,
      total_usuarios: 1,
      total_notas: 1,
      status: 'ativo'
    }, {
      onConflict: 'sku_global',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao criar/atualizar produto master: ${error.message}`);
  }
  
  console.log(`✅ Produto master salvo: ${data.nome_padrao} (ID: ${data.id})`);
  return { id: data.id, nome_padrao: data.nome_padrao };
}

async function criarCandidato(
  supabase: any,
  produto: ProdutoParaNormalizar,
  normalizacao: NormalizacaoSugerida,
  status: string,
  obsEmbalagem?: string | null
) {
  // ✅ CORREÇÃO 1: Buscar candidato existente ANTES de criar (SEM filtrar por status)
  const { data: candidatoExistente } = await supabase
    .from('produtos_candidatos_normalizacao')
    .select('id, status')
    .eq('nota_imagem_id', produto.nota_imagem_id)
    .eq('texto_original', produto.texto_original)
    .maybeSingle();

  if (candidatoExistente) {
    // ✅ GUARD CLAUSE: Não reprocessar candidatos já decididos
    if (['auto_aprovado', 'rejeitado'].includes(candidatoExistente.status)) {
      console.log(`⏭️ Candidato já processado (${candidatoExistente.status}), pulando: ${produto.texto_original}`);
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
        status: status, // Mudar de 'pendente' para 'auto_aprovado'
        observacoes_revisor: obsEmbalagem || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', candidatoExistente.id);

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