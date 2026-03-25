import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== TOOL DEFINITIONS ====================

// --- Stock tools (Phase 1) ---
const stockToolDefinitions = [
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

// --- List tools (Phase 2) ---
const listToolDefinitions = [
  {
    type: "function",
    function: {
      name: "listar_listas",
      description: "Retorna todas as listas de compras do usuário com contagem de itens em cada uma.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "buscar_lista_por_nome",
      description: "Busca listas de compras pelo nome/título. Se mais de uma lista for encontrada, retorna todas para desambiguação — nunca define lista ativa automaticamente.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Termo para buscar no título da lista" }
        },
        required: ["termo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "criar_lista",
      description: "Cria uma nova lista de compras. A lista criada é automaticamente definida como lista ativa.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título/nome da lista" }
        },
        required: ["titulo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "definir_lista_ativa",
      description: "Define qual lista de compras é a lista ativa atual. Operação de metadata, não conta como mutação.",
      parameters: {
        type: "object",
        properties: {
          lista_id: { type: "string", description: "ID da lista a definir como ativa" }
        },
        required: ["lista_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "listar_itens_lista",
      description: "Retorna os itens de uma lista de compras específica. Se lista_id não for informado, usa a lista ativa.",
      parameters: {
        type: "object",
        properties: {
          lista_id: { type: "string", description: "ID da lista (opcional, usa lista ativa se omitido)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "adicionar_itens_lista",
      description: "Adiciona um ou mais itens a uma lista de compras. Aceita array de itens para inserção em lote. Se lista_id não for informado, usa a lista ativa.",
      parameters: {
        type: "object",
        properties: {
          lista_id: { type: "string", description: "ID da lista (opcional, usa lista ativa se omitido)" },
          itens: {
            type: "array",
            description: "Array de itens a adicionar",
            items: {
              type: "object",
              properties: {
                produto_nome: { type: "string", description: "Nome do produto" },
                quantidade: { type: "number", description: "Quantidade" },
                unidade_medida: { type: "string", description: "Unidade: UN, KG, L, etc. Default UN" },
                produto_id: { type: "string", description: "ID do produto master (de buscar_produto_catalogo ou resolver_item_por_historico). Se fornecido, item é estruturado (item_livre=false)." },
                item_livre: { type: "boolean", description: "Se true, item é lembrete livre sem vínculo. Default false. Só use como último recurso quando nenhuma resolução estruturada for possível." }
              },
              required: ["produto_nome", "quantidade"]
            }
          }
        },
        required: ["itens"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "remover_item_lista",
      description: "Remove um item de uma lista de compras. Se houver múltiplos itens com nome similar, retorna opções para desambiguação.",
      parameters: {
        type: "object",
        properties: {
          lista_id: { type: "string", description: "ID da lista (opcional, usa lista ativa se omitido)" },
          item_nome: { type: "string", description: "Nome do item a remover" },
          item_id: { type: "string", description: "ID específico do item (se já identificado)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "alterar_quantidade_item_lista",
      description: "Altera a quantidade de um item em uma lista de compras. Se houver múltiplos itens com nome similar, retorna opções para desambiguação.",
      parameters: {
        type: "object",
        properties: {
          lista_id: { type: "string", description: "ID da lista (opcional, usa lista ativa se omitido)" },
          item_nome: { type: "string", description: "Nome do item" },
          item_id: { type: "string", description: "ID específico do item (se já identificado)" },
          nova_quantidade: { type: "number", description: "Nova quantidade do item" }
        },
        required: ["nova_quantidade"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "resolver_item_por_historico",
      description: "Busca no histórico de compras (notas fiscais confirmadas) do usuário para encontrar produtos habituais. Retorna os mais frequentes com último preço. DEVE ser chamada ANTES de adicionar_itens_lista para tentar resolver o produto de forma estruturada.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Termo do produto para buscar no histórico" }
        },
        required: ["termo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "buscar_produto_catalogo",
      description: "Busca produtos no catálogo master global (produtos_master_global). Use APÓS resolver_item_por_historico se o histórico não retornar resultados. Retorna produto_master_id que pode ser passado para adicionar_itens_lista para criar item estruturado (não livre).",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Termo para buscar no catálogo de produtos" }
        },
        required: ["termo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calcular_valor_lista",
      description: "Estima o valor total de uma lista de compras usando preços conhecidos do usuário. Retorna total estimado e itens sem preço.",
      parameters: {
        type: "object",
        properties: {
          lista_id: { type: "string", description: "ID da lista (opcional, usa lista ativa se omitido)" }
        },
        required: []
      }
    }
  }
];

const toolDefinitions = [...stockToolDefinitions, ...listToolDefinitions];

// ==================== HELPER: resolve lista_id ====================

async function resolveListaId(
  args: Record<string, any>,
  supabase: any,
  usuarioId: string,
  listaAtivaId: string | null
): Promise<{ listaId: string | null; erro: string | null }> {
  const listaId = args.lista_id || listaAtivaId;
  if (!listaId) {
    return { listaId: null, erro: "Nenhuma lista ativa definida. Use listar_listas para ver suas listas ou criar_lista para criar uma nova." };
  }
  // Verify ownership
  const { data, error } = await supabase.from('listas_compras').select('id').eq('id', listaId).eq('user_id', usuarioId).maybeSingle();
  if (error || !data) {
    return { listaId: null, erro: "Lista não encontrada ou não pertence a este usuário." };
  }
  return { listaId, erro: null };
}

// ==================== TOOL EXECUTION ====================

async function executeTool(
  toolName: string,
  args: Record<string, any>,
  supabase: any,
  usuarioId: string,
  state: { writeMutationsExecuted: number },
  listaAtivaId: string | null
): Promise<{ result: string; isWriteMutation: boolean }> {
  
  const writeMutationTools = [
    'baixar_estoque', 'aumentar_estoque', 'adicionar_produto',
    'criar_lista', 'adicionar_itens_lista', 'remover_item_lista', 'alterar_quantidade_item_lista'
  ];
  const isWriteMutation = writeMutationTools.includes(toolName);

  // Guard: max 1 write mutation per message
  if (isWriteMutation && state.writeMutationsExecuted >= 1) {
    return {
      result: JSON.stringify({ 
        erro: "Limite atingido: você já realizou uma alteração nesta mensagem. Envie outra mensagem para continuar.",
        bloqueado: true 
      }),
      isWriteMutation: false
    };
  }

  try {
    switch (toolName) {
      // ==================== STOCK TOOLS (Phase 1) ====================
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
          return { result: JSON.stringify({ mensagem: "Nenhum item encontrado no estoque.", itens: [] }), isWriteMutation: false };
        }
        const itensFormatados = data.map((item: any) => ({
          id: item.id, nome: item.produto_nome, quantidade: item.quantidade, unidade: item.unidade_medida,
          categoria: item.categoria, marca: item.marca, preco: item.preco_unitario_ultimo, atualizado: item.updated_at
        }));
        return { result: JSON.stringify({ total: data.length, itens: itensFormatados }), isWriteMutation: false };
      }

      case 'baixar_estoque': {
        let query = supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida').eq('user_id', usuarioId);
        if (args.produto_id) { query = query.eq('id', args.produto_id); } else { query = query.ilike('produto_nome', `%${args.produto_nome}%`); }
        const { data: produtos, error } = await query;
        if (error) throw error;
        if (!produtos || produtos.length === 0) {
          return { result: JSON.stringify({ erro: `Produto "${args.produto_nome}" não encontrado no estoque. Use buscar_produtos_similares para encontrar o nome correto.` }), isWriteMutation: false };
        }
        if (produtos.length > 1 && !args.produto_id) {
          return { result: JSON.stringify({ erro: "Múltiplos produtos encontrados. Peça ao usuário para especificar qual:", opcoes: produtos.map((p: any) => ({ id: p.id, nome: p.produto_nome, quantidade: p.quantidade, unidade: p.unidade_medida })) }), isWriteMutation: false };
        }
        const produto = produtos[0];
        const novaQtd = Math.max(0, produto.quantidade - args.quantidade);
        const { error: updateError } = await supabase.from('estoque_app').update({ quantidade: novaQtd, updated_at: new Date().toISOString() }).eq('id', produto.id).eq('user_id', usuarioId);
        if (updateError) throw updateError;
        return { result: JSON.stringify({ sucesso: true, produto: produto.produto_nome, quantidade_anterior: produto.quantidade, quantidade_removida: args.quantidade, quantidade_atual: novaQtd }), isWriteMutation: true };
      }

      case 'aumentar_estoque': {
        let query = supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida').eq('user_id', usuarioId);
        if (args.produto_id) { query = query.eq('id', args.produto_id); } else { query = query.ilike('produto_nome', `%${args.produto_nome}%`); }
        const { data: produtos, error } = await query;
        if (error) throw error;
        if (!produtos || produtos.length === 0) {
          return { result: JSON.stringify({ erro: `Produto "${args.produto_nome}" não encontrado no estoque. Use buscar_produtos_similares para encontrar o nome correto, ou pergunte se deseja adicionar como produto novo.` }), isWriteMutation: false };
        }
        if (produtos.length > 1 && !args.produto_id) {
          return { result: JSON.stringify({ erro: "Múltiplos produtos encontrados. Peça ao usuário para especificar qual:", opcoes: produtos.map((p: any) => ({ id: p.id, nome: p.produto_nome, quantidade: p.quantidade, unidade: p.unidade_medida })) }), isWriteMutation: false };
        }
        const produto = produtos[0];
        const novaQtd = produto.quantidade + args.quantidade;
        const { error: updateError } = await supabase.from('estoque_app').update({ quantidade: novaQtd, updated_at: new Date().toISOString() }).eq('id', produto.id).eq('user_id', usuarioId);
        if (updateError) throw updateError;
        return { result: JSON.stringify({ sucesso: true, produto: produto.produto_nome, quantidade_anterior: produto.quantidade, quantidade_adicionada: args.quantidade, quantidade_atual: novaQtd }), isWriteMutation: true };
      }

      case 'adicionar_produto': {
        const { data: existente } = await supabase.from('estoque_app').select('id, produto_nome, quantidade').eq('user_id', usuarioId).ilike('produto_nome', `%${args.produto_nome}%`).limit(5);
        if (existente && existente.length > 0) {
          return { result: JSON.stringify({ aviso: "Produtos similares já existem no estoque. Pergunte se o usuário quer adicionar quantidade a um existente ou criar um novo:", existentes: existente.map((p: any) => ({ id: p.id, nome: p.produto_nome, quantidade: p.quantidade })) }), isWriteMutation: false };
        }
        const { data: novo, error } = await supabase.from('estoque_app').insert({
          user_id: usuarioId, produto_nome: args.produto_nome, quantidade: args.quantidade,
          unidade_medida: args.unidade_medida || 'UN', categoria: args.categoria || 'Outros', origem: 'whatsapp'
        }).select().single();
        if (error) throw error;
        return { result: JSON.stringify({ sucesso: true, produto: novo.produto_nome, quantidade: novo.quantidade, unidade: novo.unidade_medida, categoria: novo.categoria }), isWriteMutation: true };
      }

      case 'itens_acabando': {
        const { data, error } = await supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida, categoria').eq('user_id', usuarioId).lte('quantidade', 1).order('quantidade').limit(20);
        if (error) throw error;
        if (!data || data.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhum item acabando no estoque! Tudo em ordem. 👍" }), isWriteMutation: false };
        }
        return { result: JSON.stringify({ total: data.length, itens: data.map((i: any) => ({ nome: i.produto_nome, quantidade: i.quantidade, unidade: i.unidade_medida, categoria: i.categoria })) }), isWriteMutation: false };
      }

      case 'buscar_produtos_similares': {
        const { data, error } = await supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida, categoria').eq('user_id', usuarioId).ilike('produto_nome', `%${args.termo}%`).order('produto_nome').limit(10);
        if (error) throw error;
        return { result: JSON.stringify({ termo_buscado: args.termo, encontrados: data?.length || 0, produtos: (data || []).map((p: any) => ({ id: p.id, nome: p.produto_nome, quantidade: p.quantidade, unidade: p.unidade_medida, categoria: p.categoria })) }), isWriteMutation: false };
      }

      case 'ultimas_compras': {
        const limite = args.limite || 5;
        const { data: notas, error } = await supabase.from('notas').select('id, mercado, total, created_at, produtos').eq('user_id', usuarioId).eq('confirmada', true).order('created_at', { ascending: false }).limit(limite);
        if (error) throw error;
        if (!notas || notas.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhuma compra registrada ainda." }), isWriteMutation: false };
        }
        const comprasFormatadas = notas.map((nota: any) => {
          let itens: any[] = [];
          if (nota.produtos && Array.isArray(nota.produtos)) {
            itens = nota.produtos
              .filter((p: any) => { if (!args.produto) return true; const nome = (p.nome || p.descricao || p.produto_nome || '').toLowerCase(); return nome.includes(args.produto.toLowerCase()); })
              .slice(0, 10)
              .map((p: any) => ({ nome: p.nome || p.descricao || p.produto_nome || 'Sem nome', quantidade: p.quantidade || p.qtd || 1, preco_unitario: p.preco_unitario || p.valor_unitario || null, preco_total: p.preco_total || p.valor_total || null }));
          }
          return { data: nota.created_at, mercado: nota.mercado || 'Não identificado', total: nota.total, itens_encontrados: itens.length, itens };
        });
        const resultado = args.produto ? comprasFormatadas.filter((c: any) => c.itens_encontrados > 0) : comprasFormatadas;
        return { result: JSON.stringify({ total_notas: resultado.length, compras: resultado }), isWriteMutation: false };
      }

      case 'salvar_preferencia': {
        const updateData: any = { updated_at: new Date().toISOString() };
        if (args.nome_preferido !== undefined) updateData.nome_preferido = args.nome_preferido;
        if (args.estilo_conversa !== undefined) updateData.estilo_conversa = args.estilo_conversa;
        const { error } = await supabase.from('whatsapp_preferencias_usuario').upsert({ usuario_id: usuarioId, ...updateData }, { onConflict: 'usuario_id' });
        if (error) throw error;
        return { result: JSON.stringify({ sucesso: true, mensagem: "Preferência salva com sucesso!", ...updateData }), isWriteMutation: false };
      }

      // ==================== LIST TOOLS (Phase 2) ====================

      case 'listar_listas': {
        const { data: listas, error } = await supabase.from('listas_compras').select('id, titulo, origem, created_at, updated_at').eq('user_id', usuarioId).order('updated_at', { ascending: false }).limit(20);
        if (error) throw error;
        if (!listas || listas.length === 0) {
          return { result: JSON.stringify({ mensagem: "Você não tem nenhuma lista de compras. Quer criar uma?", listas: [] }), isWriteMutation: false };
        }
        // Count items per list
        const listasComItens = await Promise.all(listas.map(async (lista: any) => {
          const { count } = await supabase.from('listas_compras_itens').select('id', { count: 'exact', head: true }).eq('lista_id', lista.id);
          return { id: lista.id, titulo: lista.titulo, origem: lista.origem, total_itens: count || 0, atualizada: lista.updated_at, ativa: lista.id === listaAtivaId };
        }));
        return { result: JSON.stringify({ total: listas.length, listas: listasComItens }), isWriteMutation: false };
      }

      case 'buscar_lista_por_nome': {
        const { data: listas, error } = await supabase.from('listas_compras').select('id, titulo, origem, created_at').eq('user_id', usuarioId).ilike('titulo', `%${args.termo}%`).order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        if (!listas || listas.length === 0) {
          return { result: JSON.stringify({ mensagem: `Nenhuma lista encontrada com "${args.termo}".`, listas: [] }), isWriteMutation: false };
        }
        if (listas.length > 1) {
          return { result: JSON.stringify({ aviso: "Múltiplas listas encontradas. Peça ao usuário para especificar qual:", listas: listas.map((l: any) => ({ id: l.id, titulo: l.titulo, origem: l.origem })) }), isWriteMutation: false };
        }
        return { result: JSON.stringify({ lista: { id: listas[0].id, titulo: listas[0].titulo, origem: listas[0].origem } }), isWriteMutation: false };
      }

      case 'criar_lista': {
        const { data: nova, error } = await supabase.from('listas_compras').insert({
          user_id: usuarioId, titulo: args.titulo, origem: 'whatsapp'
        }).select().single();
        if (error) throw error;
        // Auto-set as active list
        await supabase.from('whatsapp_preferencias_usuario').upsert({
          usuario_id: usuarioId, lista_ativa_id: nova.id, updated_at: new Date().toISOString()
        }, { onConflict: 'usuario_id' });
        return { result: JSON.stringify({ sucesso: true, lista: { id: nova.id, titulo: nova.titulo }, mensagem: "Lista criada e definida como lista ativa!" }), isWriteMutation: true };
      }

      case 'definir_lista_ativa': {
        // Verify list exists and belongs to user
        const { data: lista, error: listError } = await supabase.from('listas_compras').select('id, titulo').eq('id', args.lista_id).eq('user_id', usuarioId).maybeSingle();
        if (listError || !lista) {
          return { result: JSON.stringify({ erro: "Lista não encontrada." }), isWriteMutation: false };
        }
        const { error } = await supabase.from('whatsapp_preferencias_usuario').upsert({
          usuario_id: usuarioId, lista_ativa_id: args.lista_id, updated_at: new Date().toISOString()
        }, { onConflict: 'usuario_id' });
        if (error) throw error;
        return { result: JSON.stringify({ sucesso: true, mensagem: `Lista "${lista.titulo}" definida como ativa.` }), isWriteMutation: false };
      }

      case 'listar_itens_lista': {
        const { listaId, erro } = await resolveListaId(args, supabase, usuarioId, listaAtivaId);
        if (erro) return { result: JSON.stringify({ erro }), isWriteMutation: false };

        const { data: lista } = await supabase.from('listas_compras').select('titulo').eq('id', listaId).single();
        const { data: itens, error } = await supabase.from('listas_compras_itens').select('id, produto_nome, quantidade, unidade_medida, comprado').eq('lista_id', listaId).order('created_at');
        if (error) throw error;
        return {
          result: JSON.stringify({
            lista: lista?.titulo || 'Sem título', lista_id: listaId,
            total_itens: itens?.length || 0,
            itens: (itens || []).map((i: any) => ({ id: i.id, nome: i.produto_nome, quantidade: i.quantidade, unidade: i.unidade_medida, comprado: i.comprado }))
          }),
          isWriteMutation: false
        };
      }

      case 'adicionar_itens_lista': {
        const { listaId, erro } = await resolveListaId(args, supabase, usuarioId, listaAtivaId);
        if (erro) return { result: JSON.stringify({ erro }), isWriteMutation: false };

        const itensParaInserir = (args.itens || []).map((item: any) => ({
          lista_id: listaId,
          produto_nome: item.produto_nome,
          quantidade: item.quantidade || 1,
          unidade_medida: item.unidade_medida || 'UN',
          item_livre: true
        }));

        if (itensParaInserir.length === 0) {
          return { result: JSON.stringify({ erro: "Nenhum item fornecido para adicionar." }), isWriteMutation: false };
        }

        const { data: inseridos, error } = await supabase.from('listas_compras_itens').insert(itensParaInserir).select();
        if (error) throw error;

        return {
          result: JSON.stringify({
            sucesso: true,
            itens_adicionados: inseridos.length,
            itens: inseridos.map((i: any) => ({ nome: i.produto_nome, quantidade: i.quantidade, unidade: i.unidade_medida }))
          }),
          isWriteMutation: true
        };
      }

      case 'remover_item_lista': {
        const { listaId, erro } = await resolveListaId(args, supabase, usuarioId, listaAtivaId);
        if (erro) return { result: JSON.stringify({ erro }), isWriteMutation: false };

        let query = supabase.from('listas_compras_itens').select('id, produto_nome, quantidade, unidade_medida').eq('lista_id', listaId);
        if (args.item_id) {
          query = query.eq('id', args.item_id);
        } else if (args.item_nome) {
          query = query.ilike('produto_nome', `%${args.item_nome}%`);
        } else {
          return { result: JSON.stringify({ erro: "Informe item_nome ou item_id para remover." }), isWriteMutation: false };
        }

        const { data: itens, error: findError } = await query;
        if (findError) throw findError;
        if (!itens || itens.length === 0) {
          return { result: JSON.stringify({ erro: `Item "${args.item_nome || args.item_id}" não encontrado na lista.` }), isWriteMutation: false };
        }
        if (itens.length > 1 && !args.item_id) {
          return { result: JSON.stringify({ aviso: "Múltiplos itens encontrados. Peça ao usuário para especificar qual:", opcoes: itens.map((i: any) => ({ id: i.id, nome: i.produto_nome, quantidade: i.quantidade })) }), isWriteMutation: false };
        }

        const item = itens[0];
        const { error: delError } = await supabase.from('listas_compras_itens').delete().eq('id', item.id);
        if (delError) throw delError;
        return { result: JSON.stringify({ sucesso: true, removido: item.produto_nome }), isWriteMutation: true };
      }

      case 'alterar_quantidade_item_lista': {
        const { listaId, erro } = await resolveListaId(args, supabase, usuarioId, listaAtivaId);
        if (erro) return { result: JSON.stringify({ erro }), isWriteMutation: false };

        let query = supabase.from('listas_compras_itens').select('id, produto_nome, quantidade').eq('lista_id', listaId);
        if (args.item_id) {
          query = query.eq('id', args.item_id);
        } else if (args.item_nome) {
          query = query.ilike('produto_nome', `%${args.item_nome}%`);
        } else {
          return { result: JSON.stringify({ erro: "Informe item_nome ou item_id." }), isWriteMutation: false };
        }

        const { data: itens, error: findError } = await query;
        if (findError) throw findError;
        if (!itens || itens.length === 0) {
          return { result: JSON.stringify({ erro: `Item "${args.item_nome || args.item_id}" não encontrado na lista.` }), isWriteMutation: false };
        }
        if (itens.length > 1 && !args.item_id) {
          return { result: JSON.stringify({ aviso: "Múltiplos itens encontrados. Peça ao usuário para especificar:", opcoes: itens.map((i: any) => ({ id: i.id, nome: i.produto_nome, quantidade: i.quantidade })) }), isWriteMutation: false };
        }

        const item = itens[0];
        const { error: updError } = await supabase.from('listas_compras_itens').update({ quantidade: args.nova_quantidade }).eq('id', item.id);
        if (updError) throw updError;
        return { result: JSON.stringify({ sucesso: true, item: item.produto_nome, quantidade_anterior: item.quantidade, nova_quantidade: args.nova_quantidade }), isWriteMutation: true };
      }

      case 'resolver_item_por_historico': {
        const { data: notas, error } = await supabase.from('notas').select('produtos, created_at, mercado').eq('user_id', usuarioId).eq('confirmada', true).order('created_at', { ascending: false }).limit(20);
        if (error) throw error;

        const contagem: Record<string, { count: number; ultimo_preco: number | null; ultimo_mercado: string | null; ultima_data: string | null }> = {};
        for (const nota of (notas || [])) {
          if (!nota.produtos || !Array.isArray(nota.produtos)) continue;
          for (const p of nota.produtos) {
            const nome = (p.nome || p.descricao || p.produto_nome || '').toLowerCase();
            if (!nome.includes(args.termo.toLowerCase())) continue;
            const key = nome;
            if (!contagem[key]) {
              contagem[key] = { count: 0, ultimo_preco: null, ultimo_mercado: null, ultima_data: null };
            }
            contagem[key].count++;
            if (!contagem[key].ultima_data || nota.created_at > contagem[key].ultima_data!) {
              contagem[key].ultimo_preco = p.preco_unitario || p.valor_unitario || null;
              contagem[key].ultimo_mercado = nota.mercado || null;
              contagem[key].ultima_data = nota.created_at;
            }
          }
        }

        const resultados = Object.entries(contagem)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([nome, info]) => ({ nome, vezes_comprado: info.count, ultimo_preco: info.ultimo_preco, ultimo_mercado: info.ultimo_mercado }));

        if (resultados.length === 0) {
          return { result: JSON.stringify({ mensagem: `Nenhum produto com "${args.termo}" encontrado no histórico de compras.` }), isWriteMutation: false };
        }
        return { result: JSON.stringify({ termo: args.termo, resultados }), isWriteMutation: false };
      }

      case 'calcular_valor_lista': {
        const { listaId, erro } = await resolveListaId(args, supabase, usuarioId, listaAtivaId);
        if (erro) return { result: JSON.stringify({ erro }), isWriteMutation: false };

        // Get list items
        const { data: itens, error: itensError } = await supabase.from('listas_compras_itens').select('produto_nome, quantidade').eq('lista_id', listaId);
        if (itensError) throw itensError;
        if (!itens || itens.length === 0) {
          return { result: JSON.stringify({ mensagem: "Lista vazia, nada para calcular." }), isWriteMutation: false };
        }

        // Try to match each item with user's price data
        let totalEstimado = 0;
        const comPreco: any[] = [];
        const semPreco: string[] = [];

        for (const item of itens) {
          const { data: precos } = await supabase.from('precos_atuais_usuario').select('valor_unitario, produto_nome').eq('user_id', usuarioId).ilike('produto_nome', `%${item.produto_nome}%`).order('data_atualizacao', { ascending: false }).limit(1);

          if (precos && precos.length > 0) {
            const subtotal = precos[0].valor_unitario * item.quantidade;
            totalEstimado += subtotal;
            comPreco.push({ nome: item.produto_nome, quantidade: item.quantidade, preco_unitario: precos[0].valor_unitario, subtotal });
          } else {
            semPreco.push(item.produto_nome);
          }
        }

        return {
          result: JSON.stringify({
            total_estimado: Math.round(totalEstimado * 100) / 100,
            itens_com_preco: comPreco.length,
            itens_sem_preco: semPreco.length,
            aviso: semPreco.length > 0 ? "Alguns itens não têm preço conhecido. O total é uma ESTIMATIVA parcial." : "Todos os itens têm preço. Valor é uma estimativa baseada nos últimos preços pagos.",
            detalhes: comPreco,
            sem_preco: semPreco
          }),
          isWriteMutation: false
        };
      }

      default:
        return { result: JSON.stringify({ erro: `Tool "${toolName}" não reconhecida.` }), isWriteMutation: false };
    }
  } catch (error: any) {
    console.error(`❌ Erro na tool ${toolName}:`, error);
    return { result: JSON.stringify({ erro: `Erro ao executar ${toolName}: ${error.message}` }), isWriteMutation: false };
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
        resposta_enviada: audioMsg, processada: true,
        data_processamento: new Date().toISOString(), comando_identificado: 'assistente_ia'
      }).eq('id', messageId);
      return new Response(JSON.stringify({ ok: true, action: 'audio_not_supported' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Load user preferences + active list context
    const { data: preferencias } = await supabase
      .from('whatsapp_preferencias_usuario')
      .select('*')
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    const nomePreferido = preferencias?.nome_preferido || '';
    const listaAtivaId: string | null = preferencias?.lista_ativa_id || null;

    // Load active list title if set
    let listaAtivaContexto = 'Nenhuma lista ativa no momento.';
    if (listaAtivaId) {
      const { data: listaAtiva } = await supabase.from('listas_compras').select('titulo').eq('id', listaAtivaId).eq('user_id', usuarioId).maybeSingle();
      if (listaAtiva) {
        listaAtivaContexto = `Lista ativa atual: "${listaAtiva.titulo}" (id: ${listaAtivaId})`;
      } else {
        listaAtivaContexto = 'Nenhuma lista ativa no momento (lista anterior foi removida).';
      }
    }
    
    // 4. Load conversation context (last 15 messages)
    const { data: historicoMsgs } = await supabase
      .from('whatsapp_mensagens')
      .select('conteudo, resposta_enviada, data_recebimento')
      .eq('usuario_id', usuarioId)
      .eq('remetente', remetente)
      .order('data_recebimento', { ascending: false })
      .limit(15);

    const conversationHistory: Array<{ role: string; content: string }> = [];
    if (historicoMsgs && historicoMsgs.length > 1) {
      const previous = historicoMsgs.slice(1).reverse();
      for (const msg of previous) {
        if (msg.conteudo) conversationHistory.push({ role: 'user', content: msg.conteudo });
        if (msg.resposta_enviada) conversationHistory.push({ role: 'assistant', content: msg.resposta_enviada });
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

Contexto atual:
- ${listaAtivaContexto}

Regras de Estoque:
1. NUNCA invente dados — sempre use as tools para consultar o banco
2. Para QUALQUER consulta de estoque, preço ou compra: use a tool correspondente
3. Para BAIXAR ou AUMENTAR estoque com 1 match exato: execute e informe
4. Para BAIXAR ou AUMENTAR estoque com múltiplos matches: liste opções e pergunte qual
5. Para BAIXAR ou AUMENTAR estoque com 0 matches: use buscar_produtos_similares e sugira
6. Para ADICIONAR PRODUTO NOVO: SEMPRE peça confirmação explícita antes de usar a tool
7. Quando o usuário confirmar criação: aí sim execute adicionar_produto
8. Se o pedido for ambíguo, pergunte antes de agir
9. Máximo 1 alteração (estoque ou lista) por mensagem — se precisar de mais, peça que envie outra mensagem
10. Use a tool ultimas_compras para responder sobre histórico de compras reais

Regras de Listas de Compras:
11. Quando o usuário falar em "lista", NUNCA assuma lista nova. Verifique lista ativa ou listas existentes primeiro.
12. Ao criar lista nova: peça o nome, crie, e ela vira lista ativa automaticamente.
13. Ao abrir/selecionar lista existente: defina como lista ativa com definir_lista_ativa.
14. Com lista ativa, comandos de adicionar/remover/alterar operam nela sem perguntar novamente.
15. Se pedir para adicionar "na lista" sem especificar e sem lista ativa: liste as existentes e pergunte.
16. Use resolver_item_por_historico para sugerir o produto habitual do usuário quando relevante.
17. Múltiplos produtos possíveis no item: liste opções e pergunte (desambiguação de produto).
18. Múltiplas listas possíveis: liste opções e pergunte (desambiguação de lista).
19. Para valor da lista, use calcular_valor_lista e apresente como ESTIMATIVA, nunca preço garantido.
20. Ao adicionar múltiplos itens de uma vez, use uma única chamada de adicionar_itens_lista com array.
21. EXCLUSÃO DE LISTA INTEIRA NÃO É PERMITIDA pelo WhatsApp. Se o usuário pedir para excluir/apagar/deletar uma lista completa, responda: "Por segurança, a exclusão de uma lista inteira só pode ser feita diretamente no aplicativo do Picotinho."

Você pode conversar sobre qualquer assunto brevemente, mas seu foco é ajudar com estoque, compras e organização doméstica.`;

    // 6. Call AI Gateway with tool calling
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: conteudo }
    ];

    const state = { writeMutationsExecuted: 0 };
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
        
        const { result, isWriteMutation } = await executeTool(toolName, toolArgs, supabase, usuarioId, state, listaAtivaId);
        
        if (isWriteMutation) {
          state.writeMutationsExecuted++;
          console.log(`📝 Write mutations: ${state.writeMutationsExecuted}/1`);
        }

        messages.push({
          role: 'tool',
          content: result,
          // @ts-ignore - tool_call_id is needed for the API
          tool_call_id: toolCall.id
        });
      }

      if (iterations >= MAX_ITERATIONS) {
        finalResponse = "Desculpa, essa consulta ficou complexa demais! Pode simplificar o pedido?";
      }
    }

    // 7. Send response via WhatsApp
    if (finalResponse) {
      if (finalResponse.length > 4000) {
        finalResponse = finalResponse.substring(0, 3950) + "\n\n... (mensagem truncada)";
      }

      await sendWhatsAppMessage(remetente, finalResponse);
      
      await supabase.from('whatsapp_mensagens').update({
        resposta_enviada: finalResponse, processada: true,
        data_processamento: new Date().toISOString(), comando_identificado: 'assistente_ia'
      }).eq('id', messageId);

      console.log(`✅ [ASSISTANT] Resposta enviada e persistida (${finalResponse.length} chars)`);
    }

    return new Response(JSON.stringify({ 
      ok: true, iterations, writeMutations: state.writeMutationsExecuted,
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
