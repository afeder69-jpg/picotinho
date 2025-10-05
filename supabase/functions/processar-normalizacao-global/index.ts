import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProdutoParaNormalizar {
  texto_original: string;
  usuario_id?: string;
  nota_imagem_id?: string;
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

    // Extrair produtos de cada nota fiscal
    const notasIds: string[] = [];
    for (const nota of notasProcessadas || []) {
      const itens = nota.dados_extraidos?.itens || [];
      
      for (const item of itens) {
        const descricao = item.descricao || item.nome;
        if (descricao) {
          produtosParaNormalizar.push({
            texto_original: descricao,
            usuario_id: nota.usuario_id,
            nota_imagem_id: nota.id,
            origem: 'nota_fiscal'
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
        try {
          // Verificar se já foi normalizado
          const { data: jaExiste } = await supabase
            .from('produtos_candidatos_normalizacao')
            .select('id')
            .eq('texto_original', produto.texto_original)
            .maybeSingle();

          if (jaExiste) {
            console.log(`⏭️  Produto já normalizado: ${produto.texto_original}`);
            
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
            produto.texto_original,
            produto.texto_original.toUpperCase().trim()
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

            // Criar candidato auto-aprovado
            await criarCandidato(supabase, produto, normalizacao, 'auto_aprovado');
            
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
              produto.texto_original,
              resultadoBusca.candidatos || [],
              lovableApiKey
            );

            // Adicionar campos de imagem
            if (produto.imagem_url) {
              normalizacao.imagem_url = produto.imagem_url;
            }
            if (produto.imagem_path) {
              normalizacao.imagem_path = produto.imagem_path;
            }

            // Processar resultado da IA
            if (normalizacao.produto_master_id) {
              // IA encontrou variação - auto-aprovar + criar sinônimo
              await criarCandidato(supabase, produto, normalizacao, 'auto_aprovado');
              
              await supabase.rpc('criar_sinonimo_global', {
                produto_master_id_input: normalizacao.produto_master_id,
                texto_variacao_input: produto.texto_original,
                confianca_input: normalizacao.confianca
              });
              
              totalAutoAprovados++;
              console.log(`✅ Auto-aprovado pela IA (variação reconhecida): ${normalizacao.nome_padrao}`);
              
            } else if (normalizacao.confianca >= 90) {
              // Produto novo com alta confiança - criar master e auto-aprovar
              await criarProdutoMaster(supabase, normalizacao);
              await criarCandidato(supabase, produto, normalizacao, 'auto_aprovado');
              
              totalAutoAprovados++;
              console.log(`✅ Auto-aprovado pela IA (produto novo ${normalizacao.confianca}%): ${normalizacao.nome_padrao}`);
              
            } else {
              // Baixa confiança - enviar para revisão manual
              await criarCandidato(supabase, produto, normalizacao, 'pendente');
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

          totalProcessados++;

        } catch (erro: any) {
          console.error(`❌ Erro ao processar produto "${produto.texto_original}":`, erro.message);
        }
      }

      if (i + LOTE_SIZE < produtosParaNormalizar.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 🎯 LOG DE CONFIRMAÇÃO: Verificar se código chega aqui antes do timeout
    console.log('🎯 CHEGOU AQUI - vai marcar notas antes do if');
    
    // Marcar todas as notas processadas como normalizadas
    let notasMarcadasComSucesso = 0;
    let notasFalharam = 0;
    
    console.log(`📝 Tentando marcar ${notasIds.length} notas como normalizadas...`);
    console.log(`📋 IDs das notas: ${notasIds.join(', ')}`);
    
    if (notasIds.length > 0) {
      try {
        const { data: notasAtualizadas, error: updateError } = await supabase
          .from('notas_imagens')
          .update({ normalizada: true })
          .in('id', notasIds)
          .select('id');
        
        if (updateError) {
          console.error('❌ Erro ao marcar notas como normalizadas:', updateError);
          notasFalharam = notasIds.length;
        } else {
          notasMarcadasComSucesso = notasAtualizadas?.length || 0;
          notasFalharam = notasIds.length - notasMarcadasComSucesso;
          console.log(`✅ ${notasMarcadasComSucesso} notas marcadas como normalizadas com sucesso`);
          if (notasFalharam > 0) {
            console.warn(`⚠️ ${notasFalharam} notas não foram atualizadas`);
          }
        }
      } catch (error: any) {
        console.error('❌ Exceção ao marcar notas:', error.message);
        notasFalharam = notasIds.length;
      }
    } else {
      console.log('ℹ️ Nenhuma nota para marcar (array vazio)');
    }

    const resultado = {
      sucesso: true,
      total_produtos: produtosParaNormalizar.length,
      processados: totalProcessados,
      auto_aprovados: totalAutoAprovados,
      para_revisao: totalParaRevisao,
      notas_processadas: notasIds.length,
      notas_marcadas: notasMarcadasComSucesso,
      notas_falharam: notasFalharam,
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
// BUSCA MULTI-CAMADA OTIMIZADA (3 LAYERS)
// ============================================
async function buscarProdutoSimilar(
  supabase: any,
  textoOriginal: string,
  textoNormalizado: string
) {
  // CAMADA 1: Busca Exata em Sinônimos (~10ms - resolve 70-80% dos casos)
  console.log('🔍 Camada 1: Buscando em sinônimos...');
  
  const { data: sinonimo } = await supabase
    .from('produtos_sinonimos_globais')
    .select('produto_master_id, produtos_master_global(*)')
    .ilike('texto_variacao', textoNormalizado)
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
  
  // Buscar fuzzy por categoria usando RPC
  const { data: similares } = await supabase.rpc('buscar_produtos_similares', {
    texto_busca: textoNormalizado.split(' ').slice(0, 3).join(' '), // Primeiras 3 palavras
    categoria_filtro: categoriaEstimada,
    limite: 10,
    threshold: 0.3
  });

  if (similares && similares.length > 0) {
    const melhorMatch = similares[0];
    
    // Se similaridade > 80%, considera match forte
    if (melhorMatch.similarity > 0.8) {
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
  apiKey: string
): Promise<NormalizacaoSugerida> {
  console.log(`🤖 Analisando com Gemini: "${textoOriginal}"`);

  const prompt = `Você é um especialista em normalização de produtos de supermercado brasileiros.

PRODUTO PARA NORMALIZAR: "${textoOriginal}"

PRODUTOS SIMILARES NO CATÁLOGO (para referência):
${produtosSimilares.map(p => `- ${p.nome_padrao} | SKU: ${p.sku_global} | ID: ${p.id}`).join('\n') || 'Nenhum produto similar encontrado'}

INSTRUÇÕES:

**🔍 PASSO 1 - VERIFICAR SE É VARIAÇÃO DE PRODUTO EXISTENTE:**
- Compare o produto com os PRODUTOS SIMILARES acima
- Se for uma VARIAÇÃO/SINÔNIMO de algum produto existente, retorne o ID dele no campo "produto_master_id"
- Exemplos de variações que SÃO O MESMO PRODUTO:
  * "TEMPERO VERDE" e "CHEIRO VERDE" são o mesmo produto
  * "CHEIRO-VERDE" e "CHEIRO VERDE" são o mesmo produto
  * "AÇÚCAR CRISTAL" e "AÇUCAR CRISTAL" são o mesmo produto
  * "LEITE NINHO" e "LEITE EM PÓ NINHO" são o mesmo produto
  * "AGUA SANITARIA" e "ÁGUA SANITÁRIA" são o mesmo produto
- Se tiver 80%+ de certeza que é o mesmo produto, USE O produto_master_id (ID) do catálogo

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

5. Categorize em uma dessas categorias brasileiras:
   ALIMENTOS, BEBIDAS, HIGIENE, LIMPEZA, HORTIFRUTI, ACOUGUE, PADARIA, OUTROS

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
) {
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
  
  console.log(`✅ Produto salvo: ${data.nome_padrao}`);
}

async function criarCandidato(
  supabase: any,
  produto: ProdutoParaNormalizar,
  normalizacao: NormalizacaoSugerida,
  status: string
) {
  const { error } = await supabase
    .from('produtos_candidatos_normalizacao')
    .insert({
      texto_original: produto.texto_original,
      usuario_id: produto.usuario_id || null,
      nota_imagem_id: produto.nota_imagem_id || null,
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
      status: status
    });

  if (error) {
    throw new Error(`Erro ao criar candidato: ${error.message}`);
  }
}