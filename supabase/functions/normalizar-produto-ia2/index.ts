import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const { 
      notaId,
      usuarioId,
      dadosExtraidos,
      debug = false 
    } = await req.json();

    if (!notaId || !usuarioId) {
      return new Response(
        JSON.stringify({ error: 'notaId e usuarioId são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 IA-2 assumindo processo completo para nota: ${notaId}`);

    // ✅ PROTEÇÃO CONTRA PROCESSAMENTO DUPLO
    const { data: notaExistente, error: notaError } = await supabase
      .from('notas_imagens')
      .select('processada')
      .eq('id', notaId)
      .single();

    if (notaError) {
      throw new Error(`Nota não encontrada: ${notaError.message}`);
    }

    if (notaExistente.processada) {
      console.log('⚠️ IA-2 BLOQUEADO: Nota já foi processada anteriormente');
      return new Response(
        JSON.stringify({ 
          success: false,
          message: 'Nota já foi processada anteriormente - bloqueado para evitar duplicação',
          error: 'ALREADY_PROCESSED'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados da nota se não foram fornecidos
    let extractedData = dadosExtraidos;
    if (!extractedData) {
      const { data: notaImagem, error: notaError } = await supabase
        .from('notas_imagens')
        .select('dados_extraidos')
        .eq('id', notaId)
        .single();

      if (notaError || !notaImagem) {
        throw new Error(`Nota não encontrada: ${notaError?.message}`);
      }

      extractedData = notaImagem.dados_extraidos;
    }

    if (!extractedData) {
      throw new Error('Dados extraídos não encontrados');
    }

    // Verificar se há produtos para processar
    const listaItens = extractedData.produtos || extractedData.itens;
    if (!listaItens || !Array.isArray(listaItens) || listaItens.length === 0) {
      throw new Error('Nota não contém produtos válidos para processar');
    }

    console.log(`📦 IA-2 processando ${listaItens.length} produtos da nota...`);

    let itensProcessados = 0;
    let itensComErro = 0;
    const resultados = [];
    
    // Cache para evitar processar o mesmo produto múltiplas vezes
    const cacheProcessamento = new Map();
    const hashesExistentes = new Set();

    // Processar cada item da nota
    for (let index = 0; index < listaItens.length; index++) {
      const item = listaItens[index];
      try {
        const nomeOriginal = item.nome || item.descricao;
        if (!nomeOriginal || nomeOriginal.trim() === '') {
          continue;
        }

        // Verificar se já processamos este produto nesta sessão
        const chaveCache = nomeOriginal.trim().toUpperCase();
        if (cacheProcessamento.has(chaveCache)) {
          console.log(`⏭️ Item já processado nesta sessão: ${nomeOriginal}`);
          const produtoCache = cacheProcessamento.get(chaveCache);
          
          // Apenas atualizar quantidade se for o mesmo produto
          await atualizarQuantidadeExistente(supabase, produtoCache, item, usuarioId);
          itensProcessados++;
          continue;
        }

        console.log(`🔄 IA-2 processando item ${index + 1}: ${nomeOriginal}`);

        // 1. Verificar normalização manual primeiro
        let produtoNormalizado = await buscarNormalizacaoManual(supabase, nomeOriginal);
        
        if (!produtoNormalizado) {
          // 2. Verificar se já existe um produto similar no estoque (evitar IA desnecessária)
          const produtoSimilar = await buscarProdutoSimilarNoEstoque(supabase, nomeOriginal, usuarioId);
          if (produtoSimilar) {
            console.log(`♻️ Produto similar encontrado no estoque: ${produtoSimilar.produto_nome}`);
            await atualizarQuantidadeExistente(supabase, produtoSimilar, item, usuarioId);
            itensProcessados++;
            continue;
          }
          
          // 3. Processar com IA-2 se não encontrou normalização manual nem produto similar
          produtoNormalizado = await processarComIA2(openaiApiKey, nomeOriginal, debug);
        }

        // 3. Gerar hash SKU determinístico
        if (!produtoNormalizado.produto_hash_normalizado) {
          const hashSKU = await gerarHashSKU(produtoNormalizado);
          produtoNormalizado.produto_hash_normalizado = hashSKU;
        }
        
        // Verificar se este hash já foi processado nesta sessão
        if (hashesExistentes.has(produtoNormalizado.produto_hash_normalizado)) {
          console.log(`⚠️ Hash duplicado detectado para: ${nomeOriginal} - pulando`);
          continue;
        }
        
        hashesExistentes.add(produtoNormalizado.produto_hash_normalizado);
        cacheProcessamento.set(chaveCache, produtoNormalizado);
          
          // 🔍 DEBUG: Log detalhado para diagnóstico de SKU
          console.log(`🔍 DEBUG SKU para "${nomeOriginal}":`);
          console.log(`  - nome_base: "${produtoNormalizado.nome_base}"`);
          console.log(`  - marca: "${produtoNormalizado.marca}"`);
          console.log(`  - qtd_base: ${produtoNormalizado.qtd_base}`);
          console.log(`  - qtd_unidade: "${produtoNormalizado.qtd_unidade}"`);
          console.log(`  - tipo_embalagem: "${produtoNormalizado.tipo_embalagem}"`);
          console.log(`  - granel: ${produtoNormalizado.granel}`);
          console.log(`  - hash_gerado: ${hashSKU}`);
        }

        // 4. ✅ IA-2 INSERE NO ESTOQUE USANDO HASH SKU ÚNICO
        const quantidadeItem = parseFloat(item.quantidade || 0);
        const valorUnitario = parseFloat(item.valor_unitario || 0);
        
        console.log(`📊 Dados extraídos da nota - Nome: "${item.descricao || item.nome}" | Qtd: ${quantidadeItem} | Valor: R$ ${valorUnitario}`);
        
        await inserirProdutoNoEstoque(supabase, {
          ...produtoNormalizado,
          quantidade_final: quantidadeItem,
          valor_unitario_final: valorUnitario,
          categoria: produtoNormalizado.categoria || 'OUTROS'
        }, usuarioId);

        console.log(`✅ IA-2 inseriu item ${index + 1}: ${produtoNormalizado.produto_nome_normalizado} - ${quantidadeItem} ${produtoNormalizado.qtd_unidade || 'UN'} - R$ ${valorUnitario}`);
        itensProcessados++;
        resultados.push({
          produto_original: nomeOriginal,
          produto_normalizado: produtoNormalizado.produto_nome_normalizado,
          quantidade: quantidadeItem,
          preco: valorUnitario
        });

      } catch (error) {
        console.error(`❌ IA-2 erro ao processar item ${index + 1}:`, error);
        itensComErro++;
      }
    }

    // 6. Marcar nota como processada
    const { error: updateError } = await supabase
      .from('notas_imagens')
      .update({
        processada: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', notaId);

    if (updateError) {
      console.error('❌ IA-2 erro ao atualizar nota:', updateError);
    } else {
      console.log('✅ IA-2 marcou nota como processada');
    }

    console.log(`🎯 IA-2 PROCESSO COMPLETO: ${itensProcessados} produtos inseridos, ${itensComErro} erros`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `IA-2 processou completamente: ${itensProcessados} produtos inseridos no estoque`,
        itens_processados: itensProcessados,
        itens_com_erro: itensComErro,
        resultados: resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ IA-2 erro geral:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function buscarNormalizacaoManual(supabase: any, nomeOriginal: string) {
  const nomeProcessado = nomeOriginal.toUpperCase().trim();
  
  const { data: normalizacao } = await supabase
    .from('normalizacoes_produtos')
    .select('*')
    .eq('nome_original', nomeProcessado)
    .eq('ativo', true)
    .single();

  if (normalizacao) {
    return {
      produto_nome_normalizado: normalizacao.nome_normalizado,
      nome_base: normalizacao.nome_base || normalizacao.nome_normalizado,
      marca: normalizacao.marca,
      tipo_embalagem: normalizacao.tipo_embalagem,
      qtd_valor: normalizacao.qtd_valor,
      qtd_unidade: normalizacao.qtd_unidade,
      qtd_base: normalizacao.qtd_base,
      granel: normalizacao.granel || false,
      produto_hash_normalizado: normalizacao.produto_hash || await gerarHashSKU({
        nome_base: normalizacao.nome_base || normalizacao.nome_normalizado,
        marca: normalizacao.marca,
        qtd_base: normalizacao.qtd_base,
        qtd_unidade: normalizacao.qtd_unidade,
        tipo_embalagem: normalizacao.tipo_embalagem,
        granel: normalizacao.granel || false
      }),
      origem: 'manual'
    };
  }

  return null;
}

async function processarComIA2(openaiApiKey: string, nomeOriginal: string, debug: boolean) {
  const prompt = `Você é o IA-2, motor de normalização de produtos do Picotinho. Sua função é transformar descrições brutas de notas fiscais em produtos padronizados e consistentes.

ENTRADA: "${nomeOriginal}"

REGRAS OBRIGATÓRIAS:

1. EXPANSÃO DE ABREVIAÇÕES:
   - PC/PCT → PACOTE
   - BDJ → BANDEJA  
   - K → KG
   - LT/L → LITRO
   - UN/UND/UNID → UNIDADE
   - FILE → FILÉ
   - FRGO → FRANGO
   - SAB → SABÃO
   - DETERG → DETERGENTE
   - E todas as outras abreviações comuns

2. ESTRUTURA DO NOME CANÔNICO (ordem obrigatória):
   PRODUTO BASE + MARCA + EMBALAGEM/QUANTIDADE/UNIDADE + EXTRAS

   Exemplos:
   - "FILE PEITO BDJ SEARA 1K" → "FILÉ DE PEITO SEARA BANDEJA 1 KG"
   - "COCA-COLA 1,250LT" → "COCA-COLA 1,25 LITRO"
   - "IP SAB PÓ 2KG" → "SABÃO EM PÓ IP PACOTE 2 KG"
   - "TEMPERO VERDE 1 UNIDADE" → "TEMPERO VERDE 1 UNIDADE"
   - "MILHO VERDE PREDILETO 170 G LATA" → "MILHO VERDE PREDILETO 170 G LATA"

3. PRESERVAÇÃO CRÍTICA:
   - NUNCA remover peso/volume da embalagem (170G, 1KG, 2L, etc.)
   - NUNCA colocar quantidade comprada no nome
   - NUNCA alterar marcas (manter Seara, Predileto, Coca-Cola, etc.)
   - SEMPRE manter informações da embalagem original

4. CATEGORIZAÇÃO (use apenas estas 11):
   - HORTIFRUTI (frutas, verduras, legumes)
   - BEBIDAS (refrigerantes, sucos, águas)
   - MERCEARIA (grãos, temperos, enlatados, molhos)
   - AÇOUGUE (carnes frescas, embutidos)
   - PADARIA (pães, bolos, biscoitos)
   - LATICÍNIOS/FRIOS (leite, queijo, iogurte, manteiga)
   - LIMPEZA (detergente, sabão, desinfetante)
   - HIGIENE/FARMÁCIA (shampoo, sabonete, remédios)
   - CONGELADOS (sorvetes, carnes congeladas)
   - PET (ração, acessórios para animais)
   - OUTROS (apenas em último caso)

5. DETECÇÃO DE QUANTIDADE/UNIDADE:
   - Identifique peso/volume da EMBALAGEM (não quantidade comprada)
   - Converta para unidades base: g/ml para qtd_base
   - 1KG = 1000g, 1L = 1000ml, 1UN = 1

6. DETECÇÃO DE GRANEL:
   - Identifique se produto é vendido a granel
   - Palavras-chave: "GRANEL", "A GRANEL"

RETORNE APENAS JSON VÁLIDO:

{
  "produto_nome_normalizado": "NOME COMPLETO EXPANDIDO E PADRONIZADO",
  "nome_base": "PRODUTO SEM MARCA/EMBALAGEM/PESO",
  "marca": "MARCA DETECTADA OU null",
  "tipo_embalagem": "BANDEJA/PACOTE/LATA/etc OU null",
  "qtd_valor": 1.5,
  "qtd_unidade": "KG/G/L/ML/UN",
  "qtd_base": 1500,
  "granel": false,
  "categoria": "CATEGORIA_FIXA"
}

Processe: "${nomeOriginal}"`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Você é o IA-2, especialista em normalização de produtos de supermercado. Retorne APENAS JSON válido, sem explicações.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 800
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API falhou: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const respostaIA = data.choices[0]?.message?.content || '';

  if (debug) {
    console.log(`[IA-2] Resposta OpenAI: ${respostaIA}`);
  }

  // Extrair JSON da resposta
  const jsonMatch = respostaIA.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('IA retornou resposta inválida (sem JSON)');
  }

  try {
    const resultado = JSON.parse(jsonMatch[0]);
    
    // Validação obrigatória
    if (!resultado.produto_nome_normalizado) {
      throw new Error('IA não retornou produto_nome_normalizado');
    }

    // Normalizar categoria para lista fixa
    const categoriasValidas = [
      'HORTIFRUTI', 'BEBIDAS', 'MERCEARIA', 'AÇOUGUE', 'PADARIA',
      'LATICÍNIOS/FRIOS', 'LIMPEZA', 'HIGIENE/FARMÁCIA', 'CONGELADOS', 'PET', 'OUTROS'
    ];
    
    if (!categoriasValidas.includes(resultado.categoria)) {
      resultado.categoria = 'OUTROS';
    }

    // Garantir campos obrigatórios
    resultado.nome_base = resultado.nome_base || resultado.produto_nome_normalizado;
    resultado.qtd_base = resultado.qtd_base || (resultado.qtd_valor || 1);
    resultado.granel = Boolean(resultado.granel);

    return resultado;

  } catch (parseError) {
    throw new Error(`Erro ao parsear JSON da IA: ${parseError.message}`);
  }
}

async function inserirProdutoNoEstoque(supabase: any, produto: any, usuarioId: string) {
  try {
    console.log(`🔍 Buscando produto existente com hash: ${produto.produto_hash_normalizado}`);
    
    // Buscar produto existente usando SKU hash único
    const { data: produtoExistente } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', usuarioId)
      .eq('produto_hash_normalizado', produto.produto_hash_normalizado)
      .maybeSingle();

    if (produtoExistente) {
      // Atualizar quantidade existente (SOMA)
      const { error: updateError } = await supabase
        .from('estoque_app')
        .update({
          quantidade: produtoExistente.quantidade + produto.quantidade_final,
          preco_unitario_ultimo: produto.valor_unitario_final,
          updated_at: new Date().toISOString()
        })
        .eq('id', produtoExistente.id);

      if (updateError) throw updateError;
      console.log(`✅ SKU existente atualizado: ${produto.produto_nome_normalizado} (${produtoExistente.quantidade} + ${produto.quantidade_final} = ${produtoExistente.quantidade + produto.quantidade_final})`);
    } else {
      // Inserir novo produto no estoque
      const { error: insertError } = await supabase
        .from('estoque_app')
        .insert({
          user_id: usuarioId,
          produto_nome: produto.produto_nome_normalizado,
          produto_nome_normalizado: produto.produto_nome_normalizado,
          nome_base: produto.nome_base,
          marca: produto.marca,
          tipo_embalagem: produto.tipo_embalagem,
          qtd_valor: produto.qtd_valor,
          qtd_unidade: produto.qtd_unidade,
          qtd_base: produto.qtd_base,
          granel: produto.granel,
          categoria: produto.categoria,
          quantidade: produto.quantidade_final,
          unidade_medida: produto.qtd_unidade || 'UN',
          preco_unitario_ultimo: produto.valor_unitario_final,
          produto_hash_normalizado: produto.produto_hash_normalizado,
          origem: 'nota_fiscal'
        });

      if (insertError) throw insertError;
      console.log(`✅ Novo SKU inserido: ${produto.produto_nome_normalizado} (${produto.quantidade_final} ${produto.qtd_unidade || 'UN'})`);
    }
  } catch (error) {
    console.error(`❌ Erro ao inserir produto no estoque:`, error);
    throw error;
  }
}

async function gerarHashSKU(dados: any): Promise<string> {
  // Hash determinístico baseado nos campos únicos do produto
  const chaveSKU = [
    dados.nome_base || '',
    dados.marca || '',
    dados.qtd_base || 1,
    dados.qtd_unidade || 'UN',
    dados.tipo_embalagem || '',
    dados.granel ? 'GRANEL' : ''
  ].join('|').toUpperCase();

  console.log(`🔑 Gerando hash para chave: "${chaveSKU}"`);

  const encoder = new TextEncoder();
  const data = encoder.encode(chaveSKU);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  console.log(`🔑 Hash gerado: ${hash}`);
  return hash;
}

async function atualizarQuantidadeExistente(supabase: any, produtoNormalizado: any, item: any, usuarioId: string) {
  try {
    const quantidadeItem = parseFloat(item.quantidade || 0);
    
    // Buscar produto existente no estoque
    const { data: produtoExistente, error: erroConsulta } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', usuarioId)
      .eq('produto_hash_normalizado', produtoNormalizado.produto_hash_normalizado)
      .single();

    if (erroConsulta && erroConsulta.code !== 'PGRST116') {
      throw erroConsulta;
    }

    if (produtoExistente) {
      // Atualizar quantidade do produto existente
      const novaQuantidade = parseFloat(produtoExistente.quantidade) + quantidadeItem;
      
      const { error: erroUpdate } = await supabase
        .from('estoque_app')
        .update({
          quantidade: novaQuantidade,
          updated_at: new Date().toISOString()
        })
        .eq('id', produtoExistente.id);

      if (erroUpdate) throw erroUpdate;
      
      console.log(`➕ Quantidade atualizada para ${produtoNormalizado.produto_nome_normalizado}: ${produtoExistente.quantidade} + ${quantidadeItem} = ${novaQuantidade}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao atualizar quantidade existente:`, error);
  }
}

async function buscarProdutoSimilarNoEstoque(supabase: any, nomeOriginal: string, usuarioId: string) {
  try {
    // Normalizar nome para busca (remover pontuação, espaços extras, etc.)
    const nomeNormalizado = nomeOriginal
      .trim()
      .toUpperCase()
      .replace(/[^\w\s]/g, ' ')  // Remove pontuação
      .replace(/\s+/g, ' ')      // Remove espaços extras
      .trim();

    // Buscar produtos similares no estoque
    const { data: produtos, error } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', usuarioId)
      .gt('quantidade', 0);  // Apenas produtos com estoque

    if (error) {
      console.error('Erro ao buscar produtos similares:', error);
      return null;
    }

    // Procurar por similaridade alta
    for (const produto of produtos || []) {
      const nomeProdutoNormalizado = produto.produto_nome
        .trim()
        .toUpperCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Verificar se é o mesmo produto com variações pequenas
      const palavrasOriginal = nomeNormalizado.split(' ').filter(p => p.length > 2);
      const palavrasProduto = nomeProdutoNormalizado.split(' ').filter(p => p.length > 2);
      
      const palavrasComuns = palavrasOriginal.filter(p => palavrasProduto.includes(p));
      const percentualSimilaridade = palavrasComuns.length / Math.max(palavrasOriginal.length, palavrasProduto.length);
      
      if (percentualSimilaridade >= 0.7) {  // 70% de similaridade
        console.log(`🎯 Produto similar encontrado: "${nomeOriginal}" ≈ "${produto.produto_nome}" (${Math.round(percentualSimilaridade * 100)}%)`);
        return produto;
      }
    }

    return null;
  } catch (error) {
    console.error('Erro ao buscar produto similar:', error);
    return null;
  }
}