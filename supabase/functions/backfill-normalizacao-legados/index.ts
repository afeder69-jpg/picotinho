import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProdutoLegado {
  produto_nome: string;
  user_id: string;
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
  imagem_url?: string | null;
  imagem_path?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    console.log('\n🔍 Buscando produtos legados não normalizados...');

    // 1. Buscar produtos únicos do estoque_app
    const { data: produtosEstoque, error: erroEstoque } = await supabase
      .from('estoque_app')
      .select('produto_nome, user_id')
      .limit(100); // Buscar mais para filtrar depois

    if (erroEstoque) {
      throw new Error(`Erro ao buscar estoque: ${erroEstoque.message}`);
    }

    // 2. Filtrar apenas produtos que NÃO estão em produtos_candidatos_normalizacao
    const produtosParaProcessar: ProdutoLegado[] = [];
    const produtosVistos = new Set<string>();

    for (const produto of produtosEstoque || []) {
      // Evitar duplicatas
      if (produtosVistos.has(produto.produto_nome)) continue;
      produtosVistos.add(produto.produto_nome);

      // Verificar se já foi processado (case-insensitive)
      const { count } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('*', { count: 'exact', head: true })
        .ilike('texto_original', produto.produto_nome);

      if (count === 0) {
        produtosParaProcessar.push(produto);
        if (produtosParaProcessar.length >= 10) break; // Processar apenas 10 por vez
      }
    }

    console.log(`📦 Encontrados ${produtosParaProcessar.length} produtos para processar neste lote`);

    if (produtosParaProcessar.length === 0) {
      return new Response(
        JSON.stringify({
          sucesso: true,
          processados: 0,
          auto_aprovados: 0,
          para_revisao: 0,
          restantes: 0,
          progresso: '0/0',
          mensagem: 'Todos os produtos legados já foram normalizados! ✅'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Processar cada produto
    let processados = 0;
    let autoAprovados = 0;
    let paraRevisao = 0;

    for (const produto of produtosParaProcessar) {
      console.log(`\n📝 Processando: ${produto.produto_nome}`);

      // Buscar produtos similares no catálogo master (contexto para IA)
      const { data: produtosSimilares } = await supabase
        .from('produtos_master_global')
        .select('*')
        .eq('status', 'ativo')
        .order('total_usuarios', { ascending: false })
        .limit(20);

      // Chamar IA para normalizar
      const normalizacao = await normalizarComIA(
        produto.produto_nome,
        produtosSimilares || [],
        lovableApiKey
      );

      // Decidir se auto-aprovar ou enviar para revisão
      if (normalizacao.confianca >= 90 || normalizacao.produto_master_id) {
        // ✅ AUTO-APROVAR
        if (normalizacao.produto_master_id) {
          // IA encontrou produto existente - criar candidato aprovado
          await criarCandidato(supabase, produto, normalizacao, 'aprovado');
          autoAprovados++;
          console.log(`✅ Auto-aprovado (variação reconhecida): ${normalizacao.nome_padrao}`);
        } else {
          // Produto novo com alta confiança
          await criarProdutoMaster(supabase, normalizacao);
          await criarCandidato(supabase, produto, normalizacao, 'aprovado');
          autoAprovados++;
          console.log(`✅ Auto-aprovado (${normalizacao.confianca}%): ${normalizacao.nome_padrao}`);
        }
      } else {
        // ⏳ ENVIAR PARA REVISÃO
        await criarCandidato(supabase, produto, normalizacao, 'pendente');
        paraRevisao++;
        console.log(`⏳ Para revisão (${normalizacao.confianca}%): ${normalizacao.nome_padrao}`);
      }

      processados++;
    }

    // 4. Calcular quantos restam
    const { count: totalRestantes } = await supabase
      .from('estoque_app')
      .select('produto_nome', { count: 'exact', head: true });

    const { count: totalJaProcessados } = await supabase
      .from('produtos_candidatos_normalizacao')
      .select('*', { count: 'exact', head: true });

    const restantes = Math.max(0, (totalRestantes || 0) - (totalJaProcessados || 0));

    console.log(`\n✅ Lote processado: ${processados} produtos`);
    console.log(`📊 Auto-aprovados: ${autoAprovados}, Para revisão: ${paraRevisao}`);
    console.log(`📋 Restantes: ${restantes}`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        processados,
        auto_aprovados: autoAprovados,
        para_revisao: paraRevisao,
        restantes,
        progresso: `${totalJaProcessados || 0}/${totalRestantes || 0}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro no backfill:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// =====================================================
// FUNÇÕES AUXILIARES (copiadas de processar-normalizacao-global)
// =====================================================

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
    
    // APLICAR UPPERCASE EM TODOS OS CAMPOS DE TEXTO
    resultado.nome_padrao = resultado.nome_padrao?.toUpperCase() || '';
    resultado.nome_base = resultado.nome_base?.toUpperCase() || '';
    resultado.marca = resultado.marca?.toUpperCase() || null;
    resultado.categoria = resultado.categoria?.toUpperCase() || 'OUTROS';

    // VALIDAR CAMPOS DE UNIDADE BASE (fallback se IA não calcular)
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
  
  console.log(`✅ Produto master salvo: ${data.nome_padrao}`);
}

async function criarCandidato(
  supabase: any,
  produto: ProdutoLegado,
  normalizacao: NormalizacaoSugerida,
  status: string
) {
  const { error } = await supabase
    .from('produtos_candidatos_normalizacao')
    .insert({
      texto_original: produto.produto_nome,
      usuario_id: produto.user_id || null,
      nota_imagem_id: null,
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
