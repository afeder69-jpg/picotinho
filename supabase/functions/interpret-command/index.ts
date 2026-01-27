import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InterpretRequest {
  texto: string;
  usuarioId: string;
  contexto?: {
    sessaoAtiva?: any;
    ultimoComando?: string;
  };
}

interface ComandoInterpretado {
  comando: 'baixar' | 'aumentar' | 'consultar' | 'consultar_categoria' | 'adicionar' | 'estoque_baixo' | 
           'relatorio_gastos' | 'lista_compras' | 'historico_precos' | 'cancelar' | 'resposta_numerica' | 'desconhecido';
  confianca: number;
  produto?: string;
  quantidade?: number;
  unidade?: string;
  categoria?: string;
  periodo?: string;
  produtosEncontrados?: any[];
  precisaDesambiguacao?: boolean;
  opcoes?: string[];
  mensagemDesambiguacao?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧠 Iniciando interpretação inteligente de comando...');

    const { texto, usuarioId, contexto }: InterpretRequest = await req.json();

    if (!texto || !usuarioId) {
      return new Response(JSON.stringify({ error: 'texto e usuarioId são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY não configurada');
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar categorias disponíveis
    const { data: categorias } = await supabase
      .from('categorias')
      .select('nome, sinonimos')
      .eq('ativa', true);

    const listaCategorias = categorias?.map(c => c.nome).join(', ') || '';

    // Buscar produtos do estoque do usuário para contexto
    const { data: estoqueUsuario } = await supabase
      .from('estoque_app')
      .select('produto_nome, categoria, quantidade, unidade_medida')
      .eq('user_id', usuarioId)
      .gt('quantidade', 0)
      .limit(100);

    const produtosEstoque = estoqueUsuario?.map(p => 
      `${p.produto_nome} (${p.categoria}, ${p.quantidade} ${p.unidade_medida})`
    ).join('\n') || 'Estoque vazio';

    console.log(`📦 Produtos no estoque: ${estoqueUsuario?.length || 0}`);

    // Prompt para GPT interpretar o comando
    const systemPrompt = `Você é o assistente inteligente do Picotinho, um app de controle de estoque doméstico.

Sua tarefa é interpretar comandos de voz/texto em português brasileiro e extrair:
1. O tipo de comando (baixar, aumentar, consultar, etc.)
2. O produto mencionado (se houver)
3. A quantidade e unidade (se houver)
4. Se há ambiguidade que precisa ser resolvida

COMANDOS DISPONÍVEIS:
- baixar: Remover quantidade do estoque (Ex: "baixa 2 sucos", "tira 1kg de banana", "-3 leites")
- aumentar: Adicionar quantidade ao estoque (Ex: "aumenta 5 ovos", "soma 2L de leite", "+1kg arroz")
- consultar: Ver quantidade/preço de um produto (Ex: "quanto tenho de arroz?", "tem banana?")
- consultar_categoria: Ver produtos de uma categoria (Ex: "o que tenho de laticínios?", "categoria bebidas")
- adicionar: Cadastrar novo produto (Ex: "inclui sabão em pó", "cadastra detergente")
- estoque_baixo: Listar produtos acabando (Ex: "o que tá acabando?", "estoque baixo")
- relatorio_gastos: Ver gastos de um período (Ex: "quanto gastei essa semana?", "gastos do mês")
- lista_compras: Ver lista de compras sugerida (Ex: "o que preciso comprar?", "lista de compras")
- historico_precos: Ver histórico de preços (Ex: "preço do leite?", "histórico banana")
- cancelar: Cancelar operação atual (Ex: "cancela", "voltar", "não quero mais")
- resposta_numerica: Usuário respondeu com número (para seleção de opção)

CATEGORIAS DISPONÍVEIS: ${listaCategorias}

PRODUTOS NO ESTOQUE DO USUÁRIO:
${produtosEstoque}

REGRAS DE DESAMBIGUAÇÃO:
1. Se o produto mencionado pode corresponder a MÚLTIPLOS produtos no estoque (ex: "suco" pode ser suco de laranja, maracujá, uva), você DEVE:
   - Definir precisaDesambiguacao: true
   - Listar todos os produtos similares em opcoes[]
   - Criar uma mensagemDesambiguacao perguntando qual o usuário quer

2. Se o produto não existe no estoque mas há SIMILARES, sugerir os similares

3. Se não há correspondência, definir produtosEncontrados como array vazio

FORMATO DE RESPOSTA (JSON):
{
  "comando": "baixar|aumentar|consultar|...",
  "confianca": 0.0-1.0,
  "produto": "nome do produto mencionado",
  "quantidade": número ou null,
  "unidade": "kg|g|l|ml|un|null",
  "categoria": "nome da categoria se mencionada",
  "periodo": "hoje|semana|mes|ano se mencionado",
  "produtosEncontrados": [{"produto_nome": "...", "quantidade": N, "unidade_medida": "..."}],
  "precisaDesambiguacao": true/false,
  "opcoes": ["Produto 1", "Produto 2"],
  "mensagemDesambiguacao": "Encontrei X produtos similares. Qual você quer?\n1. ...\n2. ..."
}

IMPORTANTE:
- Seja tolerante a erros de digitação e variações de linguagem natural
- "Baixa meio quilo de alho" = quantidade: 0.5, unidade: "kg"
- "Tira 500 gramas de carne" = quantidade: 500, unidade: "g" (ou 0.5 kg)
- Aceite variações coloquiais: "tem", "quanto", "mostra", etc.`;

    const userPrompt = `Interprete este comando: "${texto}"${contexto?.sessaoAtiva ? `\n\nContexto: Há uma sessão ativa de ${contexto.sessaoAtiva.estado}` : ''}`;

    console.log('🚀 Enviando para GPT-4...');

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!gptResponse.ok) {
      const errorText = await gptResponse.text();
      console.error('❌ Erro do GPT:', errorText);
      return new Response(JSON.stringify({ error: 'Erro na interpretação', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const gptResult = await gptResponse.json();
    const interpretacao: ComandoInterpretado = JSON.parse(gptResult.choices[0].message.content);

    console.log('✅ Interpretação concluída:', JSON.stringify(interpretacao, null, 2));

    // Se precisa desambiguação, verificar produtos no estoque
    if (interpretacao.produto && !interpretacao.precisaDesambiguacao) {
      // Buscar produtos que correspondem ao nome mencionado
      const produtoMencionado = interpretacao.produto.toLowerCase();
      
      const produtosCorrespondentes = estoqueUsuario?.filter(p => {
        const nomeProduto = p.produto_nome.toLowerCase();
        return nomeProduto.includes(produtoMencionado) || 
               produtoMencionado.includes(nomeProduto.split(' ')[0]);
      }) || [];

      if (produtosCorrespondentes.length > 1) {
        // Múltiplas correspondências - precisa desambiguação
        interpretacao.precisaDesambiguacao = true;
        interpretacao.produtosEncontrados = produtosCorrespondentes;
        interpretacao.opcoes = produtosCorrespondentes.map(p => p.produto_nome);
        interpretacao.mensagemDesambiguacao = `🤔 Encontrei ${produtosCorrespondentes.length} produtos similares:\n\n` +
          produtosCorrespondentes.map((p, i) => 
            `${i + 1}. ${p.produto_nome} (${p.quantidade.toFixed(3).replace('.', ',')} ${p.unidade_medida})`
          ).join('\n') +
          `\n\nQual você quer? Responda com o número.`;
      } else if (produtosCorrespondentes.length === 1) {
        interpretacao.produtosEncontrados = produtosCorrespondentes;
      } else {
        // Nenhum produto encontrado - buscar similares
        const similares = estoqueUsuario?.filter(p => {
          const nomeProduto = p.produto_nome.toLowerCase();
          const palavras = produtoMencionado.split(' ');
          return palavras.some(palavra => 
            nomeProduto.includes(palavra) && palavra.length > 2
          );
        }).slice(0, 5) || [];

        if (similares.length > 0) {
          interpretacao.precisaDesambiguacao = true;
          interpretacao.produtosEncontrados = similares;
          interpretacao.opcoes = similares.map(p => p.produto_nome);
          interpretacao.mensagemDesambiguacao = `❌ Não encontrei "${interpretacao.produto}" no seu estoque.\n\n` +
            `Você quis dizer algum destes?\n\n` +
            similares.map((p, i) => 
              `${i + 1}. ${p.produto_nome} (${p.quantidade.toFixed(3).replace('.', ',')} ${p.unidade_medida})`
            ).join('\n') +
            `\n\nResponda com o número ou "não" para cancelar.`;
        } else {
          interpretacao.produtosEncontrados = [];
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      interpretacao,
      textoOriginal: texto
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Erro na interpretação:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

serve(handler);
