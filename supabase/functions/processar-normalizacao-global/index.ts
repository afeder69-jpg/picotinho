import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProdutoParaNormalizar {
  texto_original: string;
  usuario_id: string;
  nota_imagem_id: string;
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
  granel: boolean;
  confianca: number;
  razao: string;
  produto_master_id: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Iniciando processamento de normalização global');

    // Inicializar Supabase
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
      .not('dados_extraidos', 'is', null);

    if (notasError) {
      throw new Error(`Erro ao buscar notas: ${notasError.message}`);
    }

    console.log(`📦 Encontradas ${notasProcessadas?.length || 0} notas processadas`);

    const produtosParaNormalizar: ProdutoParaNormalizar[] = [];

    // Extrair produtos de cada nota
    for (const nota of notasProcessadas || []) {
      const itens = nota.dados_extraidos?.itens || [];
      
      for (const item of itens) {
        const descricao = item.descricao || item.nome;
        if (descricao) {
          produtosParaNormalizar.push({
            texto_original: descricao,
            usuario_id: nota.usuario_id,
            nota_imagem_id: nota.id
          });
        }
      }
    }

    console.log(`🔍 Total de produtos para normalizar: ${produtosParaNormalizar.length}`);

    // 2. PROCESSAR EM LOTES
    const LOTE_SIZE = 10; // Processar 10 produtos por vez
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
            .single();

          if (jaExiste) {
            console.log(`⏭️  Produto já normalizado: ${produto.texto_original}`);
            continue;
          }

          // Buscar produtos similares no catálogo master
          const { data: produtosSimilares } = await supabase
            .from('produtos_master_global')
            .select('*')
            .limit(5);

          // Chamar Lovable AI (Gemini) para análise
          const normalizacao = await normalizarComIA(
            produto.texto_original,
            produtosSimilares || [],
            lovableApiKey
          );

          // Decidir se auto-aprovar ou enviar para revisão
          const statusFinal = normalizacao.confianca >= 90 ? 'auto_aprovado' : 'pendente';
          
          if (statusFinal === 'auto_aprovado') {
            // AUTO-APROVAR: Criar produto master direto
            await criarProdutoMaster(supabase, normalizacao);
            totalAutoAprovados++;
            console.log(`✅ Auto-aprovado (${normalizacao.confianca}%): ${normalizacao.nome_padrao}`);
          } else {
            // ENVIAR PARA REVISÃO: Criar candidato
            await criarCandidato(supabase, produto, normalizacao, statusFinal);
            totalParaRevisao++;
            console.log(`⏳ Para revisão (${normalizacao.confianca}%): ${normalizacao.nome_padrao}`);
          }

          totalProcessados++;

        } catch (erro: any) {
          console.error(`❌ Erro ao processar produto "${produto.texto_original}":`, erro.message);
        }
      }

      // Pequeno delay entre lotes para não sobrecarregar
      if (i + LOTE_SIZE < produtosParaNormalizar.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const resultado = {
      sucesso: true,
      total_produtos: produtosParaNormalizar.length,
      processados: totalProcessados,
      auto_aprovados: totalAutoAprovados,
      para_revisao: totalParaRevisao,
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

async function normalizarComIA(
  textoOriginal: string,
  produtosSimilares: any[],
  apiKey: string
): Promise<NormalizacaoSugerida> {
  console.log(`🤖 Analisando com Gemini: "${textoOriginal}"`);

  const prompt = `Você é um especialista em normalização de produtos de supermercado brasileiros.

PRODUTO PARA NORMALIZAR: "${textoOriginal}"

PRODUTOS SIMILARES NO CATÁLOGO (para referência):
${produtosSimilares.map(p => `- ${p.nome_padrao} (SKU: ${p.sku_global})`).join('\n') || 'Nenhum produto similar encontrado'}

INSTRUÇÕES:
1. Analise o nome do produto e extraia:
   - Nome base (ex: "Arroz", "Feijão", "Leite")
   - Marca (se identificável)
   - Tipo de embalagem (Pacote, Saco, Garrafa, Caixa, etc)
   - Quantidade (valor + unidade, ex: 5 + "kg")
   - Se é granel (vendido por peso/medida)

2. Gere um SKU global único no formato: CATEGORIA-NOME_BASE-MARCA-QTDUNIDADE
   Exemplo: ALIM-ARROZ-TIOJAO-5KG

3. Categorize em uma dessas categorias brasileiras:
   ALIMENTOS, BEBIDAS, HIGIENE, LIMPEZA, HORTIFRUTI, ACOUGUE, PADARIA, OUTROS

4. Atribua uma confiança de 0-100 baseado em:
   - 90-100: Nome muito claro e estruturado
   - 70-89: Nome razoável mas com alguma ambiguidade
   - 50-69: Nome confuso ou incompleto
   - 0-49: Nome muito vago ou problemático

5. Se encontrar produto similar no catálogo (>80% similaridade), use o mesmo produto_master_id

RESPONDA APENAS COM JSON (sem markdown):
{
  "sku_global": "string",
  "nome_padrao": "string (nome normalizado limpo)",
  "categoria": "string",
  "nome_base": "string",
  "marca": "string ou null",
  "tipo_embalagem": "string ou null",
  "qtd_valor": number ou null,
  "qtd_unidade": "string ou null",
  "granel": boolean,
  "confianca": number (0-100),
  "razao": "string (explicação breve da análise)",
  "produto_master_id": "string ou null (se encontrou similar)"
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
        temperature: 0.3, // Baixa temperatura para respostas mais consistentes
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API Lovable AI: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const conteudo = data.choices[0].message.content;
    
    // Limpar markdown se houver
    const jsonLimpo = conteudo
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const resultado = JSON.parse(jsonLimpo);
    
    console.log(`✅ IA respondeu com ${resultado.confianca}% de confiança`);
    
    return resultado;

  } catch (error: any) {
    console.error('❌ Erro ao chamar Lovable AI:', error);
    // Retornar normalização básica em caso de erro
    return {
      sku_global: `TEMP-${Date.now()}`,
      nome_padrao: textoOriginal.toUpperCase(),
      categoria: 'OUTROS',
      nome_base: textoOriginal,
      marca: null,
      tipo_embalagem: null,
      qtd_valor: null,
      qtd_unidade: null,
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
  const { error } = await supabase
    .from('produtos_master_global')
    .insert({
      sku_global: normalizacao.sku_global,
      nome_padrao: normalizacao.nome_padrao,
      categoria: normalizacao.categoria,
      nome_base: normalizacao.nome_base,
      marca: normalizacao.marca,
      tipo_embalagem: normalizacao.tipo_embalagem,
      qtd_valor: normalizacao.qtd_valor,
      qtd_unidade: normalizacao.qtd_unidade,
      granel: normalizacao.granel,
      confianca_normalizacao: normalizacao.confianca,
      status: 'ativo',
      total_usuarios: 1,
      total_notas: 1
    });

  if (error) {
    throw new Error(`Erro ao criar produto master: ${error.message}`);
  }
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
      usuario_id: produto.usuario_id,
      nota_imagem_id: produto.nota_imagem_id,
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
      granel_sugerido: normalizacao.granel,
      razao_ia: normalizacao.razao,
      status: status
    });

  if (error) {
    throw new Error(`Erro ao criar candidato: ${error.message}`);
  }
}
