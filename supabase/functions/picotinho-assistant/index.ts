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
  },
  {
    type: "function",
    function: {
      name: "estoque_valor_atual",
      description: "Calcula o valor estimado do estoque usando os PREÇOS ATUAIS dos mercados na área de atuação do usuário (não o preço pago). Use quando o usuário perguntar explicitamente por 'valor atual', 'quanto valeria hoje', 'pelos preços de hoje', 'melhores preços da área'. Retorna uma estimativa dinâmica.",
      parameters: {
        type: "object",
        properties: {
          categoria: { type: "string", description: "Filtrar por categoria específica (opcional)" }
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
                item_livre: { type: "boolean", description: "Se true, item é lembrete livre sem vínculo. Default false. Só use quando o USUÁRIO confirmar explicitamente que deseja adicionar como item livre." },
                origem: { type: "string", description: "Origem do produto_id: 'catalogo', 'historico', 'opcao_numerada'. Ajuda na rastreabilidade." }
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
      description: "Busca produtos no catálogo master global (produtos_master_global). Use APÓS resolver_item_por_historico se o histórico não retornar resultados. Retorna produto_id que DEVE ser passado para adicionar_itens_lista no campo produto_id para criar item estruturado (não livre).",
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
        // Para busca por produto específico, manter lógica inline de consolidação
        if (args.tipo_busca === 'produto' && args.termo) {
          let query = supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida, categoria, marca, preco_unitario_ultimo, updated_at').eq('user_id', usuarioId);
          query = query.ilike('produto_nome', `%${args.termo}%`);
          const { data, error } = await query.order('produto_nome').limit(500);
          if (error) throw error;
          if (!data || data.length === 0) {
            return { result: JSON.stringify({ mensagem: "Nenhum item encontrado no estoque.", itens: [] }), isWriteMutation: false };
          }

          // Consolidação inline para busca por produto
          const normalizarNomeProduto = (nome: string): string => {
            return nome.toUpperCase().trim().replace(/\s+/g, ' ').replace(/\bKG\b/gi, '').replace(/\bGRANEL\s+GRANEL\b/gi, 'GRANEL').replace(/\s+/g, ' ').trim();
          };
          const produtosMap = new Map<string, any>();
          data.forEach((item: any) => {
            const chave = normalizarNomeProduto(item.produto_nome);
            if (produtosMap.has(chave)) {
              const existente = produtosMap.get(chave);
              const novaQtdTotal = existente.quantidade_total + item.quantidade;
              const itemMaisRecente = new Date(item.updated_at) > new Date(existente.updated_at);
              const precoFinal = itemMaisRecente ? (item.preco_unitario_ultimo || existente.preco) : (existente.preco || item.preco_unitario_ultimo);
              produtosMap.set(chave, { ...existente, id: itemMaisRecente ? item.id : existente.id, quantidade_total: novaQtdTotal, preco: precoFinal, updated_at: item.updated_at > existente.updated_at ? item.updated_at : existente.updated_at });
            } else {
              produtosMap.set(chave, { id: item.id, nome: chave, nome_original: item.produto_nome, quantidade_total: item.quantidade, unidade: item.unidade_medida, categoria: item.categoria, marca: item.marca, preco: item.preco_unitario_ultimo, updated_at: item.updated_at });
            }
          });
          const itensConsolidados = Array.from(produtosMap.values()).filter((item: any) => item.quantidade_total > 0).map((item: any) => ({ id: item.id, nome: item.nome, quantidade: item.quantidade_total, unidade: item.unidade, categoria: item.categoria, marca: item.marca, preco: item.preco, atualizado: item.updated_at }));
          const valorTotal = itensConsolidados.reduce((acc: number, item: any) => { const subtotalItem = Math.round(((item.preco || 0) * item.quantidade) * 100) / 100; return acc + subtotalItem; }, 0);
          return { result: JSON.stringify({ total: itensConsolidados.length, valor_total: Math.round(valorTotal * 100) / 100, itens: itensConsolidados }), isWriteMutation: false };
        }

        // Para resumo geral ("tudo") ou por categoria: usar RPC como fonte única de verdade
        const { data: resumoRPC, error: rpcError } = await supabase.rpc('resumo_estoque_por_categoria', { p_user_id: usuarioId });
        if (rpcError) throw rpcError;
        if (!resumoRPC || resumoRPC.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhum item encontrado no estoque.", itens: [] }), isWriteMutation: false };
        }

        // Se busca por categoria, filtrar pelo termo usando mapeamento de sinônimos
        let resumoFiltrado = resumoRPC;
        if (args.tipo_busca === 'categoria' && args.termo) {
          const termoLower = args.termo.toLowerCase().trim();
          // Mapeamento de sinônimos para encontrar a categoria canônica
          const sinonimoParaCanonico: Record<string, string> = {
            'açougue': 'açougue', 'acougue': 'açougue', 'carnes': 'açougue', 'carne': 'açougue', 'frango': 'açougue', 'peixe': 'açougue', 'bovino': 'açougue',
            'bebidas': 'bebidas', 'bebida': 'bebidas', 'suco': 'bebidas', 'refrigerante': 'bebidas', 'cerveja': 'bebidas', 'vinho': 'bebidas', 'água': 'bebidas', 'agua': 'bebidas',
            'hortifruti': 'hortifruti', 'frutas': 'hortifruti', 'verduras': 'hortifruti', 'legumes': 'hortifruti',
            'laticínios/frios': 'laticínios/frios', 'laticínios': 'laticínios/frios', 'laticinios': 'laticínios/frios', 'frios': 'laticínios/frios', 'queijo': 'laticínios/frios', 'embutidos': 'laticínios/frios',
            'higiene/farmácia': 'higiene/farmácia', 'higiene': 'higiene/farmácia', 'farmácia': 'higiene/farmácia', 'farmacia': 'higiene/farmácia',
            'mercearia': 'mercearia',
            'padaria': 'padaria', 'pão': 'padaria', 'pao': 'padaria',
            'congelados': 'congelados', 'congelado': 'congelados',
            'limpeza': 'limpeza', 'detergente': 'limpeza', 'sabão': 'limpeza',
            'pet': 'pet', 'animais': 'pet', 'ração': 'pet', 'racao': 'pet',
            'outros': 'outros', 'diversos': 'outros',
          };
          const categoriaBuscada = sinonimoParaCanonico[termoLower] || termoLower;
          resumoFiltrado = resumoRPC.filter((r: any) => r.categoria === categoriaBuscada || r.categoria.includes(termoLower) || termoLower.includes(r.categoria));
        }

        const totalItens = resumoFiltrado.reduce((acc: number, r: any) => acc + Number(r.total_itens), 0);
        const valorTotal = resumoFiltrado.reduce((acc: number, r: any) => acc + Number(r.valor_pago), 0);

        return { result: JSON.stringify({
          total: totalItens,
          valor_total: Math.round(valorTotal * 100) / 100,
          resumo_por_categoria: resumoFiltrado.map((r: any) => ({
            categoria: r.categoria,
            total_itens: Number(r.total_itens),
            valor_pago: Number(r.valor_pago),
          })),
        }), isWriteMutation: false };
      }

      case 'estoque_valor_atual': {
        // Buscar estoque consolidado (mesma lógica de buscar_estoque)
        let queryAtual = supabase.from('estoque_app').select('id, produto_nome, quantidade, unidade_medida, categoria, marca, preco_unitario_ultimo, updated_at, produto_master_id, produto_nome_normalizado, user_id').eq('user_id', usuarioId);
        if (args.categoria) {
          queryAtual = queryAtual.ilike('categoria', `%${args.categoria}%`);
        }
        const { data: dataAtual, error: errorAtual } = await queryAtual.order('produto_nome').limit(500);
        if (errorAtual) throw errorAtual;
        if (!dataAtual || dataAtual.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhum item encontrado no estoque.", itens: [] }), isWriteMutation: false };
        }

        // Consolidar (mesma lógica)
        const normNome = (nome: string): string => nome.toUpperCase().trim().replace(/\s+/g, ' ').replace(/\bKG\b/gi, '').replace(/\bGRANEL\s+GRANEL\b/gi, 'GRANEL').replace(/\s+/g, ' ').trim();
        const mapAtual = new Map<string, any>();
        dataAtual.forEach((item: any) => {
          const chave = normNome(item.produto_nome);
          if (mapAtual.has(chave)) {
            const ex = mapAtual.get(chave);
            const maisRecente = new Date(item.updated_at) > new Date(ex.updated_at);
            mapAtual.set(chave, {
              ...ex,
              quantidade_total: ex.quantidade_total + item.quantidade,
              preco_pago: maisRecente ? (item.preco_unitario_ultimo || ex.preco_pago) : (ex.preco_pago || item.preco_unitario_ultimo),
              updated_at: item.updated_at > ex.updated_at ? item.updated_at : ex.updated_at,
              produto_master_id: item.produto_master_id || ex.produto_master_id,
              produto_nome_normalizado: item.produto_nome_normalizado || ex.produto_nome_normalizado,
            });
          } else {
            mapAtual.set(chave, {
              nome: chave,
              quantidade_total: item.quantidade,
              unidade: item.unidade_medida,
              categoria: item.categoria,
              preco_pago: item.preco_unitario_ultimo,
              updated_at: item.updated_at,
              produto_master_id: item.produto_master_id,
              produto_nome_normalizado: item.produto_nome_normalizado,
            });
          }
        });

        const itensAtual = Array.from(mapAtual.values()).filter((i: any) => i.quantidade_total > 0);

        // Buscar preços atuais da área via precos_atuais
        // Buscar configuração de área do usuário
        const { data: configUser } = await supabase.from('configuracoes_usuario').select('raio_busca_km').eq('usuario_id', usuarioId).maybeSingle();
        const { data: perfil } = await supabase.from('profiles').select('latitude, longitude').eq('user_id', usuarioId).maybeSingle();
        const raio = configUser?.raio_busca_km || 5.0;

        // Buscar supermercados na área
        let cnpjsArea: string[] = [];
        if (perfil?.latitude && perfil?.longitude) {
          const { data: mercados } = await supabase.from('supermercados').select('cnpj, latitude, longitude').not('latitude', 'is', null).not('longitude', 'is', null);
          if (mercados) {
            const R = 6371;
            cnpjsArea = mercados.filter((m: any) => {
              const dLat = (m.latitude - perfil.latitude) * Math.PI / 180;
              const dLon = (m.longitude - perfil.longitude) * Math.PI / 180;
              const a = Math.sin(dLat/2)**2 + Math.cos(perfil.latitude * Math.PI / 180) * Math.cos(m.latitude * Math.PI / 180) * Math.sin(dLon/2)**2;
              return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= raio;
            }).map((m: any) => m.cnpj).filter(Boolean);
          }
        }

        // Buscar menor preço por produto na área
        let precosArea: any[] = [];
        if (cnpjsArea.length > 0) {
          const { data: precos } = await supabase.from('precos_atuais').select('produto_nome, valor_unitario, estabelecimento_nome, produto_master_id').in('estabelecimento_cnpj', cnpjsArea);
          precosArea = precos || [];
        }

        // Mapear menor preço por produto (via master_id ou nome normalizado)
        const menorPrecoPorProduto = new Map<string, { preco: number; mercado: string }>();
        precosArea.forEach((p: any) => {
          const chaves: string[] = [];
          if (p.produto_master_id) chaves.push(`master:${p.produto_master_id}`);
          if (p.produto_nome) chaves.push(`nome:${normNome(p.produto_nome)}`);
          chaves.forEach(chave => {
            const atual = menorPrecoPorProduto.get(chave);
            if (!atual || p.valor_unitario < atual.preco) {
              menorPrecoPorProduto.set(chave, { preco: p.valor_unitario, mercado: p.estabelecimento_nome });
            }
          });
        });

        let valorPagoTotal = 0;
        let valorAtualTotal = 0;
        let itensSemPrecoArea = 0;
        const itensDetalhe: any[] = [];

        itensAtual.forEach((item: any) => {
          const subtotalPago = Math.round(((item.preco_pago || 0) * item.quantidade_total) * 100) / 100;
          valorPagoTotal += subtotalPago;

          // Buscar preço da área (prioridade master_id, fallback nome)
          let precoArea: { preco: number; mercado: string } | undefined;
          if (item.produto_master_id) {
            precoArea = menorPrecoPorProduto.get(`master:${item.produto_master_id}`);
          }
          if (!precoArea) {
            precoArea = menorPrecoPorProduto.get(`nome:${item.nome}`);
          }

          if (precoArea) {
            const subtotalAtual = Math.round((precoArea.preco * item.quantidade_total) * 100) / 100;
            valorAtualTotal += subtotalAtual;
            itensDetalhe.push({ nome: item.nome, quantidade: item.quantidade_total, unidade: item.unidade, preco_pago: item.preco_pago, preco_area: precoArea.preco, mercado: precoArea.mercado });
          } else {
            // Sem preço na área — usar preço pago como fallback
            valorAtualTotal += subtotalPago;
            itensSemPrecoArea++;
            itensDetalhe.push({ nome: item.nome, quantidade: item.quantidade_total, unidade: item.unidade, preco_pago: item.preco_pago, preco_area: null, mercado: null });
          }
        });

        return { result: JSON.stringify({
          total_itens: itensAtual.length,
          valor_pago: Math.round(valorPagoTotal * 100) / 100,
          valor_atual_estimado: Math.round(valorAtualTotal * 100) / 100,
          itens_sem_preco_area: itensSemPrecoArea,
          raio_busca_km: raio,
          mercados_na_area: cnpjsArea.length,
          nota: "Valor atual é uma ESTIMATIVA baseada nos menores preços registrados nos mercados da sua área. Itens sem referência de preço na área usam o preço pago como fallback.",
          itens: itensDetalhe,
        }), isWriteMutation: false };
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
        const { data: itens, error } = await supabase.from('listas_compras_itens').select('id, produto_nome, quantidade, unidade_medida, comprado, produto_id').eq('lista_id', listaId).order('created_at');
        if (error) throw error;

        // Enriquecer com preços via mesma lógica do aplicativo (comparar-precos-lista)
        let precosMap: Map<string, { preco_unitario: number; mercado: string }> = new Map();
        let totalEstimado = 0;
        let itensComPreco = 0;

        try {
          const { data: comparacao, error: compError } = await supabase.functions.invoke('comparar-precos-lista', {
            body: { userId: usuarioId, listaId }
          });

          if (!compError && comparacao?.otimizado?.mercados) {
            // Montar mapa de preços: chave = produto_id (prioridade) ou produto_nome normalizado
            for (const mercado of comparacao.otimizado.mercados) {
              for (const prod of (mercado.produtos || [])) {
                // Usar o id do item da lista como chave primária (vem direto do comparar-precos-lista)
                if (prod.id && !precosMap.has(`id:${prod.id}`)) {
                  precosMap.set(`id:${prod.id}`, { preco_unitario: prod.preco_unitario, mercado: mercado.nome });
                }
              }
            }
          }
        } catch (e) {
          console.error('⚠️ Falha ao buscar preços para listar_itens_lista:', e);
          // Continua sem preços — não bloqueia a listagem
        }

        const itensEnriquecidos = (itens || []).map((i: any) => {
          const precoInfo = precosMap.get(`id:${i.id}`);
          if (precoInfo) {
            itensComPreco++;
            const subtotal = precoInfo.preco_unitario * i.quantidade;
            totalEstimado += subtotal;
            return { id: i.id, nome: i.produto_nome, quantidade: i.quantidade, unidade: i.unidade_medida, comprado: i.comprado, preco_unitario: precoInfo.preco_unitario, subtotal: Math.round(subtotal * 100) / 100, mercado: precoInfo.mercado };
          }
          return { id: i.id, nome: i.produto_nome, quantidade: i.quantidade, unidade: i.unidade_medida, comprado: i.comprado };
        });

        return {
          result: JSON.stringify({
            lista: lista?.titulo || 'Sem título', lista_id: listaId,
            total_itens: itensEnriquecidos.length,
            itens_com_preco: itensComPreco,
            total_estimado: itensComPreco > 0 ? Math.round(totalEstimado * 100) / 100 : null,
            itens: itensEnriquecidos
          }),
          isWriteMutation: false
        };
      }

      case 'adicionar_itens_lista': {
        const { listaId, erro } = await resolveListaId(args, supabase, usuarioId, listaAtivaId);
        if (erro) return { result: JSON.stringify({ erro }), isWriteMutation: false };

        if (!args.itens || args.itens.length === 0) {
          return { result: JSON.stringify({ erro: "Nenhum item fornecido para adicionar." }), isWriteMutation: false };
        }

        const itensParaInserir: any[] = [];
        const itensPendentesDesambiguacao: any[] = [];
        const itensPendentesConfirmacao: any[] = [];
        const avisos: string[] = [];

        for (const item of args.itens) {
          const origemFluxo = item.origem || 'desconhecida';
          let produtoId = item.produto_id || null;
          let validacao = 'nenhum_id';
          const produtoIdOriginal = produtoId;

          if (item.item_livre === true && !produtoId) {
            // Item livre explícito (confirmado pelo usuário) — passa direto
            console.log(`📦 [insert] ${item.produto_nome} | id_original: nenhum | id_final: nenhum | origem_fluxo: ${origemFluxo} | validacao: item_livre_explicito`);
            itensParaInserir.push({
              lista_id: listaId,
              produto_nome: item.produto_nome,
              quantidade: item.quantidade || 1,
              unidade_medida: item.unidade_medida || 'UN',
              item_livre: true
            });
            continue;
          }

          if (produtoId) {
            // Validar existência do produto_id em produtos_master_global
            const { data: existe } = await supabase
              .from('produtos_master_global')
              .select('id')
              .eq('id', produtoId)
              .maybeSingle();

            if (existe) {
              validacao = 'id_validado';
              console.log(`📦 [insert] ${item.produto_nome} | id_original: ${produtoIdOriginal} | id_final: ${produtoId} | origem_fluxo: ${origemFluxo} | validacao: ${validacao}`);
              itensParaInserir.push({
                lista_id: listaId,
                produto_nome: item.produto_nome,
                quantidade: item.quantidade || 1,
                unidade_medida: item.unidade_medida || 'UN',
                item_livre: false,
                produto_id: produtoId
              });
              continue;
            }

            // ID inválido — tentar re-resolver
            console.warn(`⚠️ produto_id ${produtoId} inválido para "${item.produto_nome}" (origem_fluxo: ${origemFluxo}). Tentando re-resolver...`);
            const palavras = item.produto_nome.split(/\s+/).filter((p: string) => p.length >= 2);
            const { data: masters } = await supabase.rpc('buscar_produtos_master_por_palavras', {
              p_palavras: palavras, p_limite: 5
            });

            if (masters?.length === 1) {
              produtoId = masters[0].id;
              validacao = 're_resolvido';
              avisos.push(`"${item.produto_nome}": ID original inválido (origem: ${origemFluxo}), corrigido automaticamente pelo catálogo.`);
              console.log(`📦 [insert] ${item.produto_nome} | id_original: ${produtoIdOriginal} | id_final: ${produtoId} | origem_fluxo: ${origemFluxo} | validacao: ${validacao}`);
              itensParaInserir.push({
                lista_id: listaId,
                produto_nome: item.produto_nome,
                quantidade: item.quantidade || 1,
                unidade_medida: item.unidade_medida || 'UN',
                item_livre: false,
                produto_id: produtoId
              });
              continue;
            }

            if (masters && masters.length > 1) {
              validacao = 'desambiguacao_necessaria';
              console.log(`📦 [insert] ${item.produto_nome} | id_original: ${produtoIdOriginal} | id_final: pendente | origem_fluxo: ${origemFluxo} | validacao: ${validacao}`);
              itensPendentesDesambiguacao.push({
                produto_nome: item.produto_nome,
                quantidade: item.quantidade || 1,
                unidade_medida: item.unidade_medida || 'UN',
                id_original_invalido: produtoIdOriginal,
                origem_fluxo: origemFluxo,
                opcoes: masters.map((m: any) => ({
                  produto_id: m.id,
                  nome_padrao: m.nome_padrao,
                  marca: m.marca,
                  categoria: m.categoria
                }))
              });
              continue;
            }

            // 0 matches — pedir confirmação para item livre
            validacao = 'confirmacao_necessaria';
            console.log(`📦 [insert] ${item.produto_nome} | id_original: ${produtoIdOriginal} | id_final: nenhum | origem_fluxo: ${origemFluxo} | validacao: ${validacao}`);
            itensPendentesConfirmacao.push({
              produto_nome: item.produto_nome,
              quantidade: item.quantidade || 1,
              unidade_medida: item.unidade_medida || 'UN',
              id_original_invalido: produtoIdOriginal,
              origem_fluxo: origemFluxo,
              motivo: `ID "${produtoIdOriginal}" não existe no catálogo e a re-resolução por nome não encontrou correspondência.`
            });
            continue;
          }

          // Sem produto_id e sem item_livre — tratar como item sem vínculo
          console.log(`📦 [insert] ${item.produto_nome} | id_original: nenhum | id_final: nenhum | origem_fluxo: ${origemFluxo} | validacao: sem_id_informado`);
          itensParaInserir.push({
            lista_id: listaId,
            produto_nome: item.produto_nome,
            quantidade: item.quantidade || 1,
            unidade_medida: item.unidade_medida || 'UN',
            item_livre: true
          });
        }

        // Upsert: consolidar itens duplicados em vez de criar novas linhas
        let inseridos: any[] = [];
        let consolidados: any[] = [];
        for (const item of itensParaInserir) {
          let existente: any = null;

          if (item.produto_id) {
            // Buscar por produto_id na mesma lista
            const { data } = await supabase
              .from('listas_compras_itens')
              .select('id, produto_nome, quantidade, unidade_medida')
              .eq('lista_id', item.lista_id)
              .eq('produto_id', item.produto_id)
              .limit(1)
              .maybeSingle();
            existente = data;
          } else if (item.item_livre) {
            // Item livre: buscar por nome (case-insensitive) na mesma lista
            const { data } = await supabase
              .from('listas_compras_itens')
              .select('id, produto_nome, quantidade, unidade_medida')
              .eq('lista_id', item.lista_id)
              .eq('item_livre', true)
              .ilike('produto_nome', item.produto_nome)
              .limit(1)
              .maybeSingle();
            existente = data;
          }

          if (existente) {
            const novaQtd = existente.quantidade + (item.quantidade || 1);
            const { error } = await supabase
              .from('listas_compras_itens')
              .update({ quantidade: novaQtd })
              .eq('id', existente.id);
            if (error) throw error;
            console.log(`📦 [upsert] ${item.produto_nome} | consolidado: +${item.quantidade || 1} → total ${novaQtd}`);
            consolidados.push({
              nome: item.produto_nome,
              quantidade_anterior: existente.quantidade,
              quantidade_adicionada: item.quantidade || 1,
              quantidade_total: novaQtd,
              unidade: existente.unidade_medida
            });
          } else {
            const { data, error } = await supabase
              .from('listas_compras_itens')
              .insert(item)
              .select()
              .single();
            if (error) throw error;
            inseridos.push(data);
          }
        }

        const resultado: any = {
          sucesso: true,
          itens_adicionados: inseridos.length,
          itens_consolidados: consolidados.length,
          itens: inseridos.map((i: any) => ({ nome: i.produto_nome, quantidade: i.quantidade, unidade: i.unidade_medida, item_livre: i.item_livre }))
        };

        if (consolidados.length > 0) {
          resultado.consolidacoes = consolidados;
          resultado.instrucao_consolidacao = "Alguns itens já existiam na lista e tiveram sua quantidade aumentada. Informe ao usuário a quantidade total atualizada.";
        }

        if (avisos.length > 0) resultado.avisos = avisos;

        if (itensPendentesDesambiguacao.length > 0) {
          resultado.itens_pendentes_desambiguacao = itensPendentesDesambiguacao;
          resultado.instrucao_desambiguacao = "Alguns itens tinham ID inválido e a re-resolução encontrou múltiplas opções. Apresente as opções ao usuário em formato numerado e pergunte qual ele quer.";
        }

        if (itensPendentesConfirmacao.length > 0) {
          resultado.itens_pendentes_confirmacao = itensPendentesConfirmacao;
          resultado.instrucao_confirmacao = "Alguns itens tinham ID inválido e não foram encontrados no catálogo. Pergunte ao usuário se deseja adicionar como item livre (sem vínculo ao catálogo, sem comparação de preço).";
        }

        return {
          result: JSON.stringify(resultado),
          isWriteMutation: inseridos.length > 0 || consolidados.length > 0
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

        const resultadosBase = Object.entries(contagem)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([nome, info]) => ({ nome, vezes_comprado: info.count, ultimo_preco: info.ultimo_preco, ultimo_mercado: info.ultimo_mercado }));

        if (resultadosBase.length === 0) {
          return { result: JSON.stringify({ mensagem: `Nenhum produto com "${args.termo}" encontrado no histórico de compras.` }), isWriteMutation: false };
        }

        // Tentar resolver produto_id via catálogo master para cada resultado
        const resultados = await Promise.all(resultadosBase.map(async (r) => {
          try {
            const palavras = r.nome.split(/\s+/).filter((p: string) => p.length >= 2);
            if (palavras.length === 0) return r;
            const { data: masters } = await supabase.rpc('buscar_produtos_master_por_palavras', { p_palavras: palavras, p_limite: 3 });
            if (masters && masters.length === 1) {
              return { ...r, produto_id: masters[0].id, nome_catalogo: masters[0].nome_padrao };
            }
            return r;
          } catch { return r; }
        }));

        return { result: JSON.stringify({ termo: args.termo, resultados }), isWriteMutation: false };
      }

      case 'calcular_valor_lista': {
        const { listaId, erro } = await resolveListaId(args, supabase, usuarioId, listaAtivaId);
        if (erro) return { result: JSON.stringify({ erro }), isWriteMutation: false };

        // Invocar a mesma Edge Function que o aplicativo usa para comparação de preços
        const { data: comparacao, error: compError } = await supabase.functions.invoke('comparar-precos-lista', {
          body: { userId: usuarioId, listaId }
        });

        if (compError || !comparacao) {
          console.error('❌ Erro ao invocar comparar-precos-lista:', compError);
          return { result: JSON.stringify({ erro: 'Não foi possível calcular os preços da lista. Verifique se sua localização está cadastrada.' }), isWriteMutation: false };
        }

        const otimizado = comparacao.otimizado || { total: 0, economia: 0, totalMercados: 0, mercados: [] };
        const produtosSemPreco = comparacao.produtosSemPreco || [];

        // Extrair detalhes dos produtos com preço do cenário otimizado
        const detalhes = (otimizado.mercados || []).flatMap((m: any) =>
          (m.produtos || []).map((p: any) => ({
            nome: p.produto_nome,
            quantidade: p.quantidade,
            preco_unitario: p.preco_unitario,
            subtotal: p.preco_total,
            mercado: m.nome
          }))
        );

        return {
          result: JSON.stringify({
            total_estimado: Math.round((otimizado.total || 0) * 100) / 100,
            itens_com_preco: detalhes.length,
            itens_sem_preco: produtosSemPreco.length,
            economia: otimizado.economia > 0 ? Math.round(otimizado.economia * 100) / 100 : 0,
            total_mercados: otimizado.totalMercados || 0,
            aviso: produtosSemPreco.length > 0
              ? "Alguns itens não têm preço nos mercados da sua área. O total é uma estimativa parcial."
              : "Preços calculados com base nos mercados da sua área de atuação.",
            detalhes,
            sem_preco: produtosSemPreco.map((i: any) => i.produto_nome)
          }),
          isWriteMutation: false
        };
      }

      case 'buscar_produto_catalogo': {
        const palavras = args.termo.split(/\s+/).filter((p: string) => p.length >= 2);
        
        if (palavras.length === 0) {
          return { result: JSON.stringify({ mensagem: "Termo muito curto para busca.", produtos: [] }), isWriteMutation: false };
        }

        const { data: produtos, error } = await supabase.rpc('buscar_produtos_master_por_palavras', {
          p_palavras: palavras,
          p_limite: 8
        });
        if (error) throw error;
        
        if (!produtos || produtos.length === 0) {
          return { result: JSON.stringify({ mensagem: `Nenhum produto encontrado no catálogo para "${args.termo}". Pode ser adicionado como item livre.`, produtos: [] }), isWriteMutation: false };
        }
        
        return {
          result: JSON.stringify({
            termo: args.termo,
            total: produtos.length,
            produtos: produtos.map((p: any) => ({
              produto_id: p.id,
              nome: p.nome_padrao,
              nome_base: p.nome_base,
              marca: p.marca,
              categoria: p.categoria,
              unidade: p.unidade_base,
              qtd: p.qtd_valor ? `${p.qtd_valor} ${p.qtd_unidade}` : null
            }))
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
    let conteudo = mensagem.conteudo;
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

    // 2. Handle audio — transcrever via Whisper e continuar fluxo normal
    if (tipoMensagem === 'audio') {
      const audioUrl = mensagem.anexo_info?.url;
      if (!audioUrl) {
        const erroMsg = "❌ Não consegui acessar o áudio. Pode tentar enviar novamente?";
        await sendWhatsAppMessage(remetente, erroMsg);
        await supabase.from('whatsapp_mensagens').update({
          resposta_enviada: erroMsg, processada: true,
          data_processamento: new Date().toISOString(), comando_identificado: 'assistente_ia'
        }).eq('id', messageId);
        return new Response(JSON.stringify({ ok: true, action: 'audio_no_url' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('🎤 Áudio detectado — iniciando transcrição via Whisper...');
      console.log('🔗 URL do áudio:', audioUrl);

      try {
        const { data: transcricao, error: transcError } = await supabase.functions.invoke('transcribe-audio', {
          body: { audioUrl }
        });

        if (transcError || !transcricao?.text) {
          console.error('❌ Erro na transcrição:', transcError || 'Sem texto retornado');
          const falhaMsg = "🎤 Não consegui entender o áudio. Pode repetir por texto?";
          await sendWhatsAppMessage(remetente, falhaMsg);
          await supabase.from('whatsapp_mensagens').update({
            resposta_enviada: falhaMsg, processada: true,
            data_processamento: new Date().toISOString(), comando_identificado: 'assistente_ia'
          }).eq('id', messageId);
          return new Response(JSON.stringify({ ok: true, action: 'audio_transcription_failed' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Transcrição bem-sucedida — substituir conteúdo e persistir
        conteudo = transcricao.text;
        console.log('✅ Transcrição concluída:', conteudo);

        await supabase.from('whatsapp_mensagens').update({
          conteudo: conteudo
        }).eq('id', messageId);

        console.log('💾 Conteúdo transcrito persistido na mensagem');
        // Fluxo continua normalmente com o texto transcrito...

      } catch (err: any) {
        console.error('❌ Exceção na transcrição:', err.message);
        const erroMsg = "🎤 Tive um problema ao processar seu áudio. Pode tentar por texto?";
        await sendWhatsAppMessage(remetente, erroMsg);
        await supabase.from('whatsapp_mensagens').update({
          resposta_enviada: erroMsg, processada: true,
          data_processamento: new Date().toISOString(), comando_identificado: 'assistente_ia'
        }).eq('id', messageId);
        return new Response(JSON.stringify({ ok: true, action: 'audio_transcription_error' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 3. Load user preferences + active list context
    const { data: preferencias } = await supabase
      .from('whatsapp_preferencias_usuario')
      .select('*')
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    const nomePreferido = preferencias?.nome_preferido || '';
    const listaAtivaId: string | null = preferencias?.lista_ativa_id || null;
    const opcoesPendentes = preferencias?.opcoes_pendentes || null;

    // --- Detectar escolha numérica e resolver via snapshot ---
    let contextoEscolhaInjetado: string | null = null;
    if (opcoesPendentes && typeof opcoesPendentes === 'object') {
      const snap = opcoesPendentes as { timestamp?: string; contexto?: string; lista_id?: string; opcoes?: Array<{ numero: number; produto_id: string; nome: string }> };
      const snapTimestamp = snap.timestamp ? new Date(snap.timestamp).getTime() : 0;
      const agora = Date.now();
      const EXPIRACAO_MS = 10 * 60 * 1000; // 10 minutos

      if (agora - snapTimestamp > EXPIRACAO_MS) {
        // Snapshot expirado — limpar
        console.log('⏰ [SNAPSHOT] Opções pendentes expiradas, limpando.');
        await supabase.from('whatsapp_preferencias_usuario').update({ opcoes_pendentes: null }).eq('usuario_id', usuarioId);
      } else {
        // Tentar detectar escolha numérica
        let numeroEscolhido: number | null = null;

        const matchNumero = conteudo.match(/^\s*(?:(?:opção|opcao|número|numero|a|quero\s+(?:a|o)?)\s*)?(\d+)\s*$/i);
        if (matchNumero) {
          numeroEscolhido = parseInt(matchNumero[1], 10);
        } else if (/^\s*(?:a\s+)?primeir[ao]\s*$/i.test(conteudo)) {
          numeroEscolhido = 1;
        } else if (/^\s*(?:a\s+)?segund[ao]\s*$/i.test(conteudo)) {
          numeroEscolhido = 2;
        } else if (/^\s*(?:a\s+)?terceir[ao]\s*$/i.test(conteudo)) {
          numeroEscolhido = 3;
        } else if (/^\s*(?:a\s+)?quart[ao]\s*$/i.test(conteudo)) {
          numeroEscolhido = 4;
        } else if (/^\s*(?:a\s+)?quint[ao]\s*$/i.test(conteudo)) {
          numeroEscolhido = 5;
        }

        if (numeroEscolhido !== null && snap.opcoes && snap.opcoes.length > 0) {
          const opcaoEscolhida = snap.opcoes.find(o => o.numero === numeroEscolhido);
          if (opcaoEscolhida) {
            contextoEscolhaInjetado = `[CONTEXTO ESTRUTURADO — USE EXATAMENTE ESTES DADOS] O usuário escolheu a opção ${numeroEscolhido}. O produto_id correspondente é "${opcaoEscolhida.produto_id}". O nome do produto é "${opcaoEscolhida.nome}". Use este produto_id EXATO ao chamar adicionar_itens_lista. NÃO busque novamente no catálogo. O contexto da ação é: ${snap.contexto || 'adicionar_item_lista'}${snap.lista_id ? ` na lista ${snap.lista_id}` : ''}.`;
            console.log(`✅ [SNAPSHOT] Escolha ${numeroEscolhido} resolvida → produto_id: ${opcaoEscolhida.produto_id}, nome: ${opcaoEscolhida.nome}`);
          } else {
            contextoEscolhaInjetado = `O usuário respondeu "${conteudo}" mas a opção ${numeroEscolhido} não existe. As opções válidas eram de 1 a ${snap.opcoes.length}. Informe o usuário e reapresente as opções: ${snap.opcoes.map(o => `${o.numero}. ${o.nome}`).join(', ')}.`;
            console.log(`⚠️ [SNAPSHOT] Opção ${numeroEscolhido} fora do range (1-${snap.opcoes.length})`);
          }
          // Limpar snapshot após uso
          await supabase.from('whatsapp_preferencias_usuario').update({ opcoes_pendentes: null }).eq('usuario_id', usuarioId);
        } else if (numeroEscolhido === null) {
          // Mensagem não é escolha numérica — usuário mudou de assunto, limpar snapshot
          console.log('🔄 [SNAPSHOT] Mensagem não é escolha numérica, limpando opções pendentes.');
          await supabase.from('whatsapp_preferencias_usuario').update({ opcoes_pendentes: null }).eq('usuario_id', usuarioId);
        }
      }
    }

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
11. VALOR DO ESTOQUE — DUAS VISÕES DISTINTAS:
    - PADRÃO (buscar_estoque): Usa o PREÇO PAGO pelo usuário (custo de compra). Para perguntas como "quanto tenho em estoque", "valor do estoque", "estoque de hortifruti".
    - VALOR ATUAL (estoque_valor_atual): Usa os PREÇOS ATUAIS dos mercados na ÁREA DE ATUAÇÃO. SOMENTE quando o usuário pedir EXPLICITAMENTE: "valor atual", "quanto valeria hoje", "pelos preços de hoje", "pelos melhores preços da área". Sempre apresente como ESTIMATIVA dinâmica e informe quantos itens não têm referência de preço na área.

Regras de Listas de Compras:
11. Quando o usuário falar em "lista", NUNCA assuma lista nova. Verifique lista ativa ou listas existentes primeiro.
12. Ao criar lista nova: peça o nome, crie, e ela vira lista ativa automaticamente.
13. Ao abrir/selecionar lista existente: defina como lista ativa com definir_lista_ativa.
14. RESOLUÇÃO IMPLÍCITA DE LISTA: Quando o usuário citar o nome de uma lista na mensagem (ex: "adiciona batata na lista teste 15"), use buscar_lista_por_nome para encontrá-la. Se houver EXATAMENTE UMA correspondência, use essa lista diretamente como destino da ação E defina-a como lista ativa em segundo plano (sem perguntar "quer ativar?"). Só pergunte quando houver ambiguidade real (2+ listas correspondentes).
15. BUSCA TOLERANTE DE LISTA: A busca por nome de lista deve ser tolerante. Se o usuário disser "lista 15", busque por "15". Se houver apenas uma lista com "15" no nome (ex: "teste 15"), use-a diretamente. Se houver múltiplas (ex: "teste 15" e "15 de agosto"), apresente as opções e pergunte.
16. Com lista ativa, comandos de adicionar/remover/alterar operam nela sem perguntar novamente.
17. Se pedir para adicionar "na lista" sem especificar e sem lista ativa: liste as existentes e pergunte.

Regras de Resolução de Produtos para Lista:
18. ORDEM OBRIGATÓRIA ao adicionar item na lista — NUNCA pule etapas:
    a) PRIMEIRO: SEMPRE chame resolver_item_por_historico com o termo do produto. Se encontrar opções, use o mais frequente (ou pergunte se houver várias opções relevantes).
    b) SEGUNDO: se o histórico retornar vazio, SEMPRE chame buscar_produto_catalogo para localizar no catálogo master global.
       - Se encontrar EXATAMENTE 1 opção óbvia, use o produto_id retornado diretamente no campo produto_id de adicionar_itens_lista.
       - Se encontrar múltiplas opções, MOSTRE-AS em formato numerado curto e pergunte qual. Formato obrigatório:
         "Encontrei estas opções:
         1. Nescau em pó 350g
         2. Nescau em pó 750g
         3. Nescau pronto para beber 200ml
         Qual você quer?"
    c) TERCEIRO (último recurso): só crie como item_livre=true quando AMBAS as buscas (histórico e catálogo) retornarem vazio E o usuário confirmar explicitamente que deseja adicionar como item livre. Ao perguntar, diga: "Não encontrei esse produto no catálogo. Quer que eu adicione como item livre? (Itens livres não participam do cálculo de preço e comparação de mercados.)"
    d) NUNCA converta automaticamente um item para item_livre por falha técnica de produto_id. Se o ID for inválido e a re-resolução não encontrar match único, pergunte ao usuário: apresente as opções encontradas (se múltiplas) ou pergunte se deseja adicionar como item livre (se nenhuma). Item livre SÓ com confirmação explícita do usuário.
    
    PROIBIDO: adicionar item_livre=true sem ter chamado resolver_item_por_historico E buscar_produto_catalogo primeiro.
    PROIBIDO: pedir ao usuário a descrição exata do produto ao invés de buscar no catálogo.
    
    Exemplo correto para "adiciona Nescau na lista":
    1. Chamar resolver_item_por_historico(termo: "nescau")
    2. Se vazio, chamar buscar_produto_catalogo(termo: "nescau")
    3. Se retornar opções, mostrar lista numerada e perguntar "Qual você quer?"
    4. Só usar item_livre se ambas retornarem vazio.

19. Múltiplos produtos possíveis no item: liste opções NUMERADAS e pergunte (desambiguação de produto). Seja curto e objetivo.
20. Múltiplas listas possíveis: liste opções NUMERADAS e pergunte (desambiguação de lista).
21. Para valor da lista, use calcular_valor_lista e apresente como ESTIMATIVA, nunca preço garantido.
22. Ao adicionar múltiplos itens de uma vez, resolva cada um antes de chamar adicionar_itens_lista. Pode usar múltiplas chamadas de resolver_item_por_historico em sequência.
23. EXCLUSÃO DE LISTA INTEIRA NÃO É PERMITIDA pelo WhatsApp. Se o usuário pedir para excluir/apagar/deletar uma lista completa, responda: "Por segurança, a exclusão de uma lista inteira só pode ser feita diretamente no aplicativo do Picotinho."
24. NUNCA diga que não consegue buscar, prever ou encontrar produtos. Você TEM as tools buscar_produto_catalogo e resolver_item_por_historico. USE-AS. Se o usuário pedir item normalizado, busque e mostre os resultados encontrados.
25. PRESERVAR IDENTIFICADOR EM ESCOLHA NUMERADA: Quando você apresentar opções numeradas ao usuário (ex: "1. Nescau 350g") e o usuário responder com um número (ex: "1"), você DEVE reutilizar o produto_id da opção correspondente que estava no resultado da tool. NUNCA reconstrua o vínculo pelo texto exibido — use o produto_id que já foi retornado pela busca. O produto_id está disponível no contexto da conversa, na resposta anterior da tool buscar_produto_catalogo ou resolver_item_por_historico.

Você pode conversar sobre qualquer assunto brevemente, mas seu foco é ajudar com estoque, compras e organização doméstica.`;

    // 6. Call AI Gateway with tool calling
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ];

    // Injetar contexto estruturado de escolha numerada, se disponível
    if (contextoEscolhaInjetado) {
      messages.push({ role: 'system', content: contextoEscolhaInjetado });
      console.log(`💉 [INJECT] Contexto de escolha numerada injetado no prompt`);
    }

    messages.push({ role: 'user', content: conteudo });

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

        // Salvar snapshot de opções pendentes se a tool retornou opções para o usuário
        try {
          const parsedResult = JSON.parse(result);
          let opcoesParaSalvar: Array<{ numero: number; produto_id: string; nome: string }> | null = null;
          let contextoSnapshot = '';
          let listaIdSnapshot: string | null = null;

          // Caso 1: buscar_produto_catalogo retornou múltiplos produtos
          if (toolName === 'buscar_produto_catalogo' && parsedResult.produtos && parsedResult.produtos.length > 1) {
            opcoesParaSalvar = parsedResult.produtos.map((p: any, i: number) => ({
              numero: i + 1,
              produto_id: p.produto_id,
              nome: p.nome || p.nome_base || 'Sem nome'
            }));
            contextoSnapshot = 'adicionar_item_lista';
            listaIdSnapshot = listaAtivaId;
          }

          // Caso 2: resolver_item_por_historico retornou múltiplos resultados com produto_id
          if (toolName === 'resolver_item_por_historico' && parsedResult.resultados && parsedResult.resultados.length > 1) {
            const comId = parsedResult.resultados.filter((r: any) => r.produto_id);
            if (comId.length > 1) {
              opcoesParaSalvar = comId.map((r: any, i: number) => ({
                numero: i + 1,
                produto_id: r.produto_id,
                nome: r.nome_catalogo || r.nome
              }));
              contextoSnapshot = 'adicionar_item_lista';
              listaIdSnapshot = listaAtivaId;
            }
          }

          // Caso 3: adicionar_itens_lista retornou itens_pendentes_desambiguacao
          if (toolName === 'adicionar_itens_lista' && parsedResult.itens_pendentes_desambiguacao) {
            for (const pendente of parsedResult.itens_pendentes_desambiguacao) {
              if (pendente.opcoes && pendente.opcoes.length > 1) {
                opcoesParaSalvar = pendente.opcoes.map((o: any, i: number) => ({
                  numero: i + 1,
                  produto_id: o.produto_id,
                  nome: o.nome_padrao || o.nome || 'Sem nome'
                }));
                contextoSnapshot = 'adicionar_item_lista';
                listaIdSnapshot = listaAtivaId;
                break; // salvar apenas o primeiro pendente por vez
              }
            }
          }

          if (opcoesParaSalvar && opcoesParaSalvar.length > 0) {
            const snapshot = {
              timestamp: new Date().toISOString(),
              contexto: contextoSnapshot,
              lista_id: listaIdSnapshot,
              opcoes: opcoesParaSalvar
            };
            await supabase.from('whatsapp_preferencias_usuario').update({ opcoes_pendentes: snapshot }).eq('usuario_id', usuarioId);
            console.log(`📸 [SNAPSHOT] Salvas ${opcoesParaSalvar.length} opções pendentes para o usuário (tool: ${toolName})`);
          }
        } catch {
          // resultado não é JSON ou erro no parse — ignorar
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
