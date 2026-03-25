import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== TOOL DEFINITIONS ====================
const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "buscar_estoque",
      description: "Busca itens no estoque do usuário. Pode buscar tudo, por nome de produto ou por categoria.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Nome do produto ou categoria para buscar. Deixe vazio para listar tudo." },
          tipo_busca: { type: "string", enum: ["produto", "categoria", "tudo"], description: "Tipo de busca" }
        },
        required: ["tipo_busca"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "baixar_estoque",
      description: "Remove quantidade de um produto do estoque. Use apenas quando tiver certeza do produto. Se houver ambiguidade, use buscar_produtos_similares primeiro.",
      parameters: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome exato ou parcial do produto" },
          quantidade: { type: "number", description: "Quantidade a remover" },
          produto_id: { type: "string", description: "ID específico do produto (se já identificado)" }
        },
        required: ["produto_nome", "quantidade"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "aumentar_estoque",
      description: "Adiciona quantidade a um produto do estoque. Se houver ambiguidade (múltiplos produtos similares), liste as opções e peça confirmação.",
      parameters: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome exato ou parcial do produto" },
          quantidade: { type: "number", description: "Quantidade a adicionar" },
          produto_id: { type: "string", description: "ID específico do produto (se já identificado)" }
        },
        required: ["produto_nome", "quantidade"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "adicionar_produto",
      description: "Cadastra um produto NOVO no estoque. SEMPRE peça confirmação antes de criar. Nunca crie sem o usuário confirmar explicitamente.",
      parameters: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome do produto" },
          quantidade: { type: "number", description: "Quantidade inicial" },
          unidade_medida: { type: "string", description: "Unidade: UN, KG, L, etc." },
          categoria: { type: "string", description: "Categoria do produto" }
        },
        required: ["produto_nome", "quantidade", "unidade_medida", "categoria"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "itens_acabando",
      description: "Lista itens do estoque com quantidade baixa (menor ou igual a 1).",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "buscar_produtos_similares",
      description: "Busca produtos no estoque com nome similar ao termo informado. Útil para desambiguação.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Termo para busca parcial" }
        },
        required: ["termo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ultimas_compras",
      description: "Consulta as últimas compras/notas fiscais do usuário. Pode filtrar por produto específico.",
      parameters: {
        type: "object",
        properties: {
          produto: { type: "string", description: "Nome do produto para filtrar (opcional)" },
          limite: { type: "number", description: "Quantidade de notas a retornar (default 5)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "salvar_preferencia",
      description: "Salva uma preferência do usuário, como nome preferido para tratamento. Esta é uma escrita de metadata, não altera estoque.",
      parameters: {
        type: "object",
        properties: {
          nome_preferido: { type: "string", description: "Como o usuário prefere ser chamado" },
          estilo_conversa: { type: "string", description: "Estilo de conversa: natural, formal, descontraido" }
        },
        required: []
      }
    }
  }
];

// ==================== TOOL EXECUTION ====================

async function executeTool(
  toolName: string,
  args: Record<string, any>,
  supabase: any,
  usuarioId: string,
  state: { stockMutationsExecuted: number }
): Promise<{ result: string; isStockMutation: boolean }> {
  
  const stockMutationTools = ['baixar_estoque', 'aumentar_estoque', 'adicionar_produto'];
  const isStockMutation = stockMutationTools.includes(toolName);

  // Guard: max 1 stock mutation per message
  if (isStockMutation && state.stockMutationsExecuted >= 1) {
    return {
      result: JSON.stringify({ 
        erro: "Limite atingido: você já realizou uma alteração de estoque nesta mensagem. Envie outra mensagem para continuar.",
        bloqueado: true 
      }),
      isStockMutation: false // don't increment again
    };
  }

  try {
    switch (toolName) {
      case 'buscar_estoque': {
        let query = supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida, categoria, marca, preco_unitario_ultimo, updated_at').eq('user_id', usuarioId);
        
        if (args.tipo_busca === 'produto' && args.termo) {
          query = query.ilike('produto_nome', `%${args.termo}%`);
        } else if (args.tipo_busca === 'categoria' && args.termo) {
          query = query.ilike('categoria', `%${args.termo}%`);
        }
        
        const { data, error } = await query.order('produto_nome').limit(50);
        if (error) throw error;
        
        if (!data || data.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhum item encontrado no estoque.", itens: [] }), isStockMutation: false };
        }
        
        const itensFormatados = data.map((item: any) => ({
          id: item.id,
          nome: item.produto_nome,
          quantidade: item.quantidade,
          unidade: item.unidade_medida,
          categoria: item.categoria,
          marca: item.marca,
          preco: item.preco_unitario_ultimo,
          atualizado: item.updated_at
        }));
        
        return { result: JSON.stringify({ total: data.length, itens: itensFormatados }), isStockMutation: false };
      }

      case 'baixar_estoque': {
        // Find product
        let query = supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida').eq('user_id', usuarioId);
        
        if (args.produto_id) {
          query = query.eq('id', args.produto_id);
        } else {
          query = query.ilike('produto_nome', `%${args.produto_nome}%`);
        }
        
        const { data: produtos, error } = await query;
        if (error) throw error;
        
        if (!produtos || produtos.length === 0) {
          return { result: JSON.stringify({ erro: `Produto "${args.produto_nome}" não encontrado no estoque. Use buscar_produtos_similares para encontrar o nome correto.` }), isStockMutation: false };
        }
        
        if (produtos.length > 1 && !args.produto_id) {
          return {
            result: JSON.stringify({
              erro: "Múltiplos produtos encontrados. Peça ao usuário para especificar qual:",
              opcoes: produtos.map((p: any) => ({ id: p.id, nome: p.produto_nome, quantidade: p.quantidade, unidade: p.unidade_medida }))
            }),
            isStockMutation: false
          };
        }
        
        const produto = produtos[0];
        const novaQtd = Math.max(0, produto.quantidade - args.quantidade);
        
        const { error: updateError } = await supabase.from('estoque_app').update({ quantidade: novaQtd, updated_at: new Date().toISOString() }).eq('id', produto.id).eq('user_id', usuarioId);
        if (updateError) throw updateError;
        
        return {
          result: JSON.stringify({ sucesso: true, produto: produto.produto_nome, quantidade_anterior: produto.quantidade, quantidade_removida: args.quantidade, quantidade_atual: novaQtd }),
          isStockMutation: true
        };
      }

      case 'aumentar_estoque': {
        let query = supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida').eq('user_id', usuarioId);
        
        if (args.produto_id) {
          query = query.eq('id', args.produto_id);
        } else {
          query = query.ilike('produto_nome', `%${args.produto_nome}%`);
        }
        
        const { data: produtos, error } = await query;
        if (error) throw error;
        
        if (!produtos || produtos.length === 0) {
          return { result: JSON.stringify({ erro: `Produto "${args.produto_nome}" não encontrado no estoque. Use buscar_produtos_similares para encontrar o nome correto, ou pergunte se deseja adicionar como produto novo.` }), isStockMutation: false };
        }
        
        if (produtos.length > 1 && !args.produto_id) {
          return {
            result: JSON.stringify({
              erro: "Múltiplos produtos encontrados. Peça ao usuário para especificar qual:",
              opcoes: produtos.map((p: any) => ({ id: p.id, nome: p.produto_nome, quantidade: p.quantidade, unidade: p.unidade_medida }))
            }),
            isStockMutation: false
          };
        }
        
        const produto = produtos[0];
        const novaQtd = produto.quantidade + args.quantidade;
        
        const { error: updateError } = await supabase.from('estoque_app').update({ quantidade: novaQtd, updated_at: new Date().toISOString() }).eq('id', produto.id).eq('user_id', usuarioId);
        if (updateError) throw updateError;
        
        return {
          result: JSON.stringify({ sucesso: true, produto: produto.produto_nome, quantidade_anterior: produto.quantidade, quantidade_adicionada: args.quantidade, quantidade_atual: novaQtd }),
          isStockMutation: true
        };
      }

      case 'adicionar_produto': {
        // Check if already exists
        const { data: existente } = await supabase.from('estoque_app').select('id, produto_nome, quantidade').eq('user_id', usuarioId).ilike('produto_nome', `%${args.produto_nome}%`).limit(5);
        
        if (existente && existente.length > 0) {
          return {
            result: JSON.stringify({
              aviso: "Produtos similares já existem no estoque. Pergunte se o usuário quer adicionar quantidade a um existente ou criar um novo:",
              existentes: existente.map((p: any) => ({ id: p.id, nome: p.produto_nome, quantidade: p.quantidade }))
            }),
            isStockMutation: false
          };
        }
        
        const { data: novo, error } = await supabase.from('estoque_app').insert({
          user_id: usuarioId,
          produto_nome: args.produto_nome,
          quantidade: args.quantidade,
          unidade_medida: args.unidade_medida || 'UN',
          categoria: args.categoria || 'Outros',
          origem: 'whatsapp'
        }).select().single();
        
        if (error) throw error;
        
        return {
          result: JSON.stringify({ sucesso: true, produto: novo.produto_nome, quantidade: novo.quantidade, unidade: novo.unidade_medida, categoria: novo.categoria }),
          isStockMutation: true
        };
      }

      case 'itens_acabando': {
        const { data, error } = await supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida, categoria').eq('user_id', usuarioId).lte('quantidade', 1).order('quantidade').limit(20);
        if (error) throw error;
        
        if (!data || data.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhum item acabando no estoque! Tudo em ordem. 👍" }), isStockMutation: false };
        }
        
        return {
          result: JSON.stringify({ total: data.length, itens: data.map((i: any) => ({ nome: i.produto_nome, quantidade: i.quantidade, unidade: i.unidade_medida, categoria: i.categoria })) }),
          isStockMutation: false
        };
      }

      case 'buscar_produtos_similares': {
        const { data, error } = await supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida, categoria').eq('user_id', usuarioId).ilike('produto_nome', `%${args.termo}%`).order('produto_nome').limit(10);
        if (error) throw error;
        
        return {
          result: JSON.stringify({
            termo_buscado: args.termo,
            encontrados: data?.length || 0,
            produtos: (data || []).map((p: any) => ({ id: p.id, nome: p.produto_nome, quantidade: p.quantidade, unidade: p.unidade_medida, categoria: p.categoria }))
          }),
          isStockMutation: false
        };
      }

      case 'ultimas_compras': {
        const limite = args.limite || 5;
        
        // Query notas confirmadas do usuário (service role bypasses RLS)
        const { data: notas, error } = await supabase.from('notas')
          .select('id, mercado, total, created_at, produtos')
          .eq('user_id', usuarioId)
          .eq('confirmada', true)
          .order('created_at', { ascending: false })
          .limit(limite);
        
        if (error) throw error;
        
        if (!notas || notas.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhuma compra registrada ainda." }), isStockMutation: false };
        }
        
        const comprasFormatadas = notas.map((nota: any) => {
          // Parse produtos from JSONB
          let itens: any[] = [];
          if (nota.produtos && Array.isArray(nota.produtos)) {
            itens = nota.produtos
              .filter((p: any) => {
                if (!args.produto) return true;
                const nome = (p.nome || p.descricao || p.produto_nome || '').toLowerCase();
                return nome.includes(args.produto.toLowerCase());
              })
              .slice(0, 10)
              .map((p: any) => ({
                nome: p.nome || p.descricao || p.produto_nome || 'Sem nome',
                quantidade: p.quantidade || p.qtd || 1,
                preco_unitario: p.preco_unitario || p.valor_unitario || null,
                preco_total: p.preco_total || p.valor_total || null
              }));
          }
          
          return {
            data: nota.created_at,
            mercado: nota.mercado || 'Não identificado',
            total: nota.total,
            itens_encontrados: itens.length,
            itens
          };
        });
        
        // If filtering by product, remove notes with 0 matching items
        const resultado = args.produto 
          ? comprasFormatadas.filter((c: any) => c.itens_encontrados > 0)
          : comprasFormatadas;
        
        return {
          result: JSON.stringify({ total_notas: resultado.length, compras: resultado }),
          isStockMutation: false
        };
      }

      case 'salvar_preferencia': {
        const updateData: any = { updated_at: new Date().toISOString() };
        if (args.nome_preferido !== undefined) updateData.nome_preferido = args.nome_preferido;
        if (args.estilo_conversa !== undefined) updateData.estilo_conversa = args.estilo_conversa;
        
        // Upsert preference
        const { error } = await supabase.from('whatsapp_preferencias_usuario').upsert({
          usuario_id: usuarioId,
          ...updateData
        }, { onConflict: 'usuario_id' });
        
        if (error) throw error;
        
        return {
          result: JSON.stringify({ sucesso: true, mensagem: "Preferência salva com sucesso!", ...updateData }),
          isStockMutation: false // metadata write — does NOT count toward stock mutation limit
        };
      }

      default:
        return { result: JSON.stringify({ erro: `Tool "${toolName}" não reconhecida.` }), isStockMutation: false };
    }
  } catch (error: any) {
    console.error(`❌ Erro na tool ${toolName}:`, error);
    return { result: JSON.stringify({ erro: `Erro ao executar ${toolName}: ${error.message}` }), isStockMutation: false };
  }
}

// ==================== SEND WHATSAPP MESSAGE ====================

async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
  const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
  const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
  
  if (!instanceUrl || !apiToken) {
    console.error('❌ WhatsApp credentials missing');
    return false;
  }
  
  try {
    const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;
    const response = await fetch(sendTextUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accountSecret ? { 'Client-Token': accountSecret } : {})
      },
      body: JSON.stringify({ phone, message })
    });
    
    if (!response.ok) {
      console.error('❌ Erro Z-API:', await response.text());
      return false;
    }
    
    console.log('✅ Mensagem enviada via Z-API');
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    return false;
  }
}

// ==================== MAIN HANDLER ====================

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messageId } = await req.json();
    
    if (!messageId) {
      throw new Error('messageId é obrigatório');
    }

    console.log(`🤖 [ASSISTANT] Processando mensagem: ${messageId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Load message
    const { data: mensagem, error: msgError } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .eq('id', messageId)
      .single();

    if (msgError || !mensagem) {
      throw new Error(`Mensagem não encontrada: ${messageId}`);
    }

    const usuarioId = mensagem.usuario_id;
    const conteudo = mensagem.conteudo;
    const remetente = mensagem.remetente;
    const tipoMensagem = mensagem.tipo_mensagem || 'text';

    if (!usuarioId) {
      console.error('❌ Mensagem sem usuario_id — não deveria chegar aqui');
      return new Response(JSON.stringify({ error: 'usuario_id ausente' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`👤 Usuário: ${usuarioId}, Tipo: ${tipoMensagem}`);

    // 2. Handle audio — not yet supported
    if (tipoMensagem === 'audio') {
      const audioMsg = "🎤 Em breve vou entender áudios! Por enquanto, me mande por texto que eu te ajudo. 😊";
      await sendWhatsAppMessage(remetente, audioMsg);
      await supabase.from('whatsapp_mensagens').update({
        resposta_enviada: audioMsg,
        processada: true,
        data_processamento: new Date().toISOString(),
        comando_identificado: 'assistente_ia'
      }).eq('id', messageId);
      
      return new Response(JSON.stringify({ ok: true, action: 'audio_not_supported' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Load user preferences
    const { data: preferencias } = await supabase
      .from('whatsapp_preferencias_usuario')
      .select('*')
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    const nomePreferido = preferencias?.nome_preferido || '';
    
    // 4. Load conversation context (last 15 messages)
    const { data: historicoMsgs } = await supabase
      .from('whatsapp_mensagens')
      .select('conteudo, resposta_enviada, data_recebimento')
      .eq('usuario_id', usuarioId)
      .eq('remetente', remetente)
      .order('data_recebimento', { ascending: false })
      .limit(15);

    // Build conversation history (reverse to chronological order, skip current message)
    const conversationHistory: Array<{ role: string; content: string }> = [];
    if (historicoMsgs && historicoMsgs.length > 1) {
      const previous = historicoMsgs.slice(1).reverse(); // skip first (current msg)
      for (const msg of previous) {
        if (msg.conteudo) {
          conversationHistory.push({ role: 'user', content: msg.conteudo });
        }
        if (msg.resposta_enviada) {
          conversationHistory.push({ role: 'assistant', content: msg.resposta_enviada });
        }
      }
    }

    // 5. Build system prompt
    const systemPrompt = `Você é o Picotinho, um assistente doméstico de compras inteligente que conversa pelo WhatsApp.

Personalidade:
- Tom natural, amigável e prestativo
- Respostas curtas e diretas (WhatsApp não é lugar para textos longos)
- Use emojis com moderação
- Seja proativo em sugerir quando fizer sentido
${nomePreferido ? `- Chame o usuário de "${nomePreferido}"` : '- Se o usuário disser como quer ser chamado, use a tool salvar_preferencia'}

Regras obrigatórias:
1. NUNCA invente dados — sempre use as tools para consultar o banco
2. Para QUALQUER consulta de estoque, preço ou compra: use a tool correspondente
3. Para BAIXAR ou AUMENTAR estoque com 1 match exato: execute e informe
4. Para BAIXAR ou AUMENTAR estoque com múltiplos matches: liste opções e pergunte qual
5. Para BAIXAR ou AUMENTAR estoque com 0 matches: use buscar_produtos_similares e sugira
6. Para ADICIONAR PRODUTO NOVO: SEMPRE peça confirmação explícita ("Posso criar X no estoque?") antes de usar a tool
7. Quando o usuário confirmar criação (sim, pode, cria, etc): aí sim execute adicionar_produto
8. Se o pedido for ambíguo, pergunte antes de agir
9. Máximo 1 alteração de estoque por mensagem — se precisar de mais, peça que envie outra mensagem
10. Use a tool ultimas_compras para responder sobre histórico de compras reais

Você pode conversar sobre qualquer assunto brevemente, mas seu foco é ajudar com estoque, compras e organização doméstica.`;

    // 6. Call AI Gateway with tool calling
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: conteudo }
    ];

    const state = { stockMutationsExecuted: 0 };
    let finalResponse = '';
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`🔄 [ASSISTANT] Iteração ${iterations}/${MAX_ITERATIONS}`);

      let aiResponse;
      try {
        const aiResult = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${lovableApiKey}`
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages,
            tools: toolDefinitions,
            tool_choice: 'auto',
            stream: false,
            temperature: 0.7
          })
        });

        if (aiResult.status === 429) {
          finalResponse = "😅 Estou com muitas conversas agora, tenta de novo em alguns segundos!";
          break;
        }

        if (aiResult.status === 402) {
          console.error('❌ AI Gateway 402 — créditos esgotados');
          finalResponse = "⚠️ Estou temporariamente indisponível. Tente novamente mais tarde!";
          break;
        }

        if (!aiResult.ok) {
          const errorText = await aiResult.text();
          console.error(`❌ AI Gateway error ${aiResult.status}:`, errorText);
          finalResponse = "😔 Tive um probleminha técnico. Tente novamente!";
          break;
        }

        aiResponse = await aiResult.json();
      } catch (fetchError) {
        console.error('❌ Erro na chamada AI Gateway:', fetchError);
        finalResponse = "😔 Não consegui processar sua mensagem. Tente novamente!";
        break;
      }

      const choice = aiResponse.choices?.[0];
      if (!choice) {
        finalResponse = "😔 Não consegui entender. Pode reformular?";
        break;
      }

      const assistantMessage = choice.message;

      // If no tool calls, we have the final response
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        finalResponse = assistantMessage.content || "🤔 Não entendi. Pode repetir?";
        break;
      }

      // Process tool calls
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, any>;
        
        try {
          toolArgs = typeof toolCall.function.arguments === 'string' 
            ? JSON.parse(toolCall.function.arguments) 
            : toolCall.function.arguments;
        } catch {
          toolArgs = {};
        }

        console.log(`🔧 [TOOL] ${toolName}(${JSON.stringify(toolArgs)})`);
        
        const { result, isStockMutation } = await executeTool(toolName, toolArgs, supabase, usuarioId, state);
        
        if (isStockMutation) {
          state.stockMutationsExecuted++;
          console.log(`📝 Stock mutations: ${state.stockMutationsExecuted}/1`);
        }

        messages.push({
          role: 'tool',
          content: result,
          // @ts-ignore - tool_call_id is needed for the API
          tool_call_id: toolCall.id
        });
      }

      // If last iteration, force a response
      if (iterations >= MAX_ITERATIONS) {
        finalResponse = "Desculpa, essa consulta ficou complexa demais! Pode simplificar o pedido?";
      }
    }

    // 7. Send response via WhatsApp
    if (finalResponse) {
      // Truncate if too long for WhatsApp
      if (finalResponse.length > 4000) {
        finalResponse = finalResponse.substring(0, 3950) + "\n\n... (mensagem truncada)";
      }

      await sendWhatsAppMessage(remetente, finalResponse);
      
      // 8. Persist response in whatsapp_mensagens
      await supabase.from('whatsapp_mensagens').update({
        resposta_enviada: finalResponse,
        processada: true,
        data_processamento: new Date().toISOString(),
        comando_identificado: 'assistente_ia'
      }).eq('id', messageId);

      console.log(`✅ [ASSISTANT] Resposta enviada e persistida (${finalResponse.length} chars)`);
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      iterations, 
      stockMutations: state.stockMutationsExecuted,
      responseLength: finalResponse.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ [ASSISTANT] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

serve(handler);
