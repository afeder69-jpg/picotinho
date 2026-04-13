import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== DELAY TYPING CONFIG ====================
const DELAY_TYPING = {
  RESPOSTA_PRINCIPAL: 5,  // segundos de "digitando..." antes da resposta principal
  FALLBACK: 3,            // segundos antes de fallbacks e mensagens de erro
};

// ==================== VOZ DO PICOTINHO ====================
// Voz fixa: "fable" — masculina, leve e expressiva, combina com personagem pequeno e simpático.
// Speed 1.1 dá um tom mais ágil e "pequenininho".
// Para trocar no futuro, basta alterar estes valores.
const PICOTINHO_VOICE = {
  voice: 'fable',
  speed: 1.1,
  model: 'tts-1',
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
      description: "Remove quantidade de produto(s) do estoque. O servidor busca por nome natural (não exige nome exato). Envie o nome como o usuário falou. Inclua a unidade quando o usuário especificar (ex: '300 gramas' → unidade: 'G'). Para múltiplos itens, use o array 'itens'.",
      parameters: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome do produto como o usuário falou (para item único)" },
          quantidade: { type: "number", description: "Quantidade a remover (para item único)" },
          unidade: { type: "string", description: "Unidade da quantidade informada: KG, G, L, ML, UN. Envie quando o usuário especificar." },
          produto_id: { type: "string", description: "ID específico do produto (se já identificado)" },
          itens: { type: "array", description: "Array de itens para baixa múltipla", items: { type: "object", properties: { produto_nome: { type: "string" }, quantidade: { type: "number" }, unidade: { type: "string" }, produto_id: { type: "string" } }, required: ["produto_nome", "quantidade"] } }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "aumentar_estoque",
      description: "Adiciona quantidade a produto(s) do estoque. O servidor busca por nome natural (não exige nome exato). Envie o nome como o usuário falou. Inclua a unidade quando o usuário especificar. Para múltiplos itens, use o array 'itens'.",
      parameters: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome do produto como o usuário falou (para item único)" },
          quantidade: { type: "number", description: "Quantidade a adicionar (para item único)" },
          unidade: { type: "string", description: "Unidade da quantidade informada: KG, G, L, ML, UN. Envie quando o usuário especificar." },
          produto_id: { type: "string", description: "ID específico do produto (se já identificado)" },
          itens: { type: "array", description: "Array de itens para aumento múltiplo", items: { type: "object", properties: { produto_nome: { type: "string" }, quantidade: { type: "number" }, unidade: { type: "string" }, produto_id: { type: "string" } }, required: ["produto_nome", "quantidade"] } }
        },
        required: []
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
      description: "Salva uma preferência do usuário, como nome preferido para tratamento ou modo de resposta. Esta é uma escrita de metadata, não altera estoque.",
      parameters: {
        type: "object",
        properties: {
          nome_preferido: { type: "string", description: "Como o usuário prefere ser chamado" },
          estilo_conversa: { type: "string", description: "Estilo de conversa: natural, formal, descontraido" },
          modo_resposta: { type: "string", enum: ["texto", "audio", "ambos"], description: "Como o usuário quer receber as respostas: texto, audio ou ambos" }
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
  },
  {
    type: "function",
    function: {
      name: "ajustar_saldo_estoque",
      description: "Ajusta o estoque de um ou mais produtos para o SALDO ATUAL informado pelo usuário. NÃO é entrada, baixa ou compra — é definição direta do saldo final. Cada item DEVE ter quantidade numérica EXATA e EXPLÍCITA (nunca inferida de frases vagas). Use quando o usuário disser coisas como 'acabou meu açúcar', 'agora só tenho 2 litros de leite', 'tenho meio quilo de banana'. Para saldo zero: 'acabou', 'não tenho mais' = novo_saldo 0.",
      parameters: {
        type: "object",
        properties: {
          itens: {
            type: "array",
            description: "Array de itens com saldo a ajustar. Cada item DEVE ter quantidade numérica exata.",
            items: {
              type: "object",
              properties: {
                produto_nome: { type: "string", description: "Nome do produto informado pelo usuário" },
                novo_saldo: { type: "number", description: "Valor EXATO do saldo atual informado pelo usuário — NUNCA inferido de frases vagas" },
                unidade: { type: "string", description: "Unidade: KG, L, UN, etc. OPCIONAL — se omitida, herda do estoque. Para saldo zero ('acabou'), NÃO envie unidade." },
                produto_id: { type: "string", description: "ID específico do produto (obrigatório se já desambiguado)" }
              },
              required: ["produto_nome", "novo_saldo"]
            }
          }
        },
        required: ["itens"]
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
      description: "Retorna os itens de uma lista de compras específica. Se lista_id não for informado, usa a lista ativa. Se não houver lista ativa, passe nome_lista para resolver automaticamente.",
      parameters: {
        type: "object",
        properties: {
          lista_id: { type: "string", description: "ID da lista (opcional, usa lista ativa se omitido)" },
          nome_lista: { type: "string", description: "Nome da lista, usado como fallback se lista_id não for fornecido e não houver lista ativa" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "adicionar_itens_lista",
      description: "Adiciona um ou mais itens a uma lista de compras. Aceita array de itens para inserção em lote. Se lista_id não for informado, usa a lista ativa. Se não houver lista ativa, passe nome_lista para resolver automaticamente.",
      parameters: {
        type: "object",
        properties: {
          lista_id: { type: "string", description: "ID da lista (opcional, usa lista ativa se omitido)" },
          nome_lista: { type: "string", description: "Nome da lista, usado como fallback se lista_id não for fornecido e não houver lista ativa" },
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
          nome_lista: { type: "string", description: "Nome da lista, usado como fallback se lista_id não for fornecido e não houver lista ativa" },
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
          nome_lista: { type: "string", description: "Nome da lista, usado como fallback se lista_id não for fornecido e não houver lista ativa" },
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

// --- Report tools (Phase 3) ---
const reportToolDefinitions = [
  {
    type: "function",
    function: {
      name: "consultar_relatorio",
      description: "Consulta relatório de compras do usuário com filtros opcionais. Retorna itens individuais com valores reais das notas fiscais. Use para QUALQUER pergunta sobre gastos, histórico de compras, 'quanto comprei', 'o que comprei', 'resuma minhas compras'.",
      parameters: {
        type: "object",
        properties: {
          data_inicio: { type: "string", description: "Data início formato YYYY-MM-DD (opcional)" },
          data_fim: { type: "string", description: "Data fim formato YYYY-MM-DD (opcional)" },
          estabelecimento: { type: "string", description: "Nome do mercado/estabelecimento (busca parcial, opcional)" },
          categoria: { type: "string", description: "Categoria canônica: mercearia, bebidas, hortifruti, limpeza, açougue, laticínios/frios, higiene/farmácia, padaria, congelados, pet, outros (opcional)" },
          produto: { type: "string", description: "Nome do produto (busca parcial, opcional)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "listar_mercados_usuario",
      description: "Lista os mercados/estabelecimentos onde o usuário já comprou. Use para desambiguação quando o nome do mercado for parcial ou houver dúvida.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

// --- Feedback tools ---
const feedbackToolDefinitions = [
  {
    type: "function",
    function: {
      name: "registrar_feedback",
      description: "Registra um feedback do usuário: erro, sugestão, reclamação ou dúvida sobre o sistema. Use quando o usuário expressar insatisfação, reportar problema, fazer sugestão ou ter dúvida sobre o funcionamento do Picotinho.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["erro", "sugestao", "reclamacao", "duvida"], description: "Tipo do feedback" },
          mensagem: { type: "string", description: "Descrição do feedback do usuário" },
          contexto: { type: "string", description: "Contexto da ação que o usuário estava realizando (opcional)" }
        },
        required: ["tipo", "mensagem"]
      }
    }
  }
];

// --- Preferences tools ---
const preferencesToolDefinitions = [
  {
    type: "function",
    function: {
      name: "gerenciar_preferencias_mensagens",
      description: "Altera as preferências de mensagens proativas do telefone que está conversando. Cada preferência controla um tipo de mensagem: promoções, novidades, avisos de estoque, dicas. Modo 'definir' altera apenas as preferências informadas (sem tocar nas demais). Modo 'exclusivo' ativa as informadas e desativa TODAS as demais.",
      parameters: {
        type: "object",
        properties: {
          pref_promocoes: { type: "boolean", description: "Ativar/desativar promoções e ofertas" },
          pref_novidades: { type: "boolean", description: "Ativar/desativar novidades do Picotinho" },
          pref_avisos_estoque: { type: "boolean", description: "Ativar/desativar avisos de estoque" },
          pref_dicas: { type: "boolean", description: "Ativar/desativar dicas e sugestões úteis" },
          modo: { type: "string", enum: ["definir", "exclusivo"], description: "definir = altera só as informadas. exclusivo = ativa as informadas e desativa as demais." }
        },
        required: ["modo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_preferencias_mensagens",
      description: "Consulta o estado atual das preferências de mensagens proativas do telefone que está conversando. Use quando o usuário perguntar quais mensagens estão ativas.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "atualizar_nome_telefone",
      description: "Atualiza o nome da pessoa vinculada ao telefone que está conversando. Use quando o usuário disser frases como 'esse número é da cozinheira', 'coloca o nome desse telefone como Camila'.",
      parameters: {
        type: "object",
        properties: {
          nome_pessoa: { type: "string", description: "Nome da pessoa vinculada ao telefone" }
        },
        required: ["nome_pessoa"]
      }
    }
  }
];

const toolDefinitions = [...stockToolDefinitions, ...listToolDefinitions, ...reportToolDefinitions, ...feedbackToolDefinitions, ...preferencesToolDefinitions];

// ==================== SHARED: MATCHING POR NÚCLEO ====================
const STOP_WORDS_SHARED = new Set([
  'de','da','do','das','dos','com','sem','em','para','por','meu','minha','meus','minhas',
  'o','a','os','as','um','uma','no','na','nos','nas','ao','aos','que','pro','pra','eu','so','ja','tb','tambem'
]);
const TOKENS_COMERCIAIS_SHARED = new Set([
  'concentrado','premium','tradicional','especial','original','sache','pacote',
  'garrafa','pet','lata','vidro','caixa','unidade','gramas','grama','litro','litros',
  'quilos','quilo','tipo','marca'
]);
const REGEX_NUM_UNIDADE_SHARED = /^\d+[a-z]*$/;
const GRUPOS_EXCLUSIVOS_SHARED = [
  ['limao','morango','uva','maracuja','abacaxi','manga','goiaba','framboesa','menta','laranja','pessego','cereja','caju','acerola','guarana','tutti','banana','maca','melancia','melao','ameixa','kiwi','tamarindo','pitanga','jabuticaba','cupuacu'],
  ['integral','desnatado','semidesnatado'],
  ['zero','diet','light'],
  ['branco','preto','vermelho','verde','amarelo','rosa'],
  ['bovino','suino','frango','peixe','peru','cordeiro'],
];
const TIPOS_BASE_CONHECIDOS_SHARED = new Set([
  'leite','suco','gelatina','geleia','xarope','cafe','cha','iogurte','queijo','manteiga',
  'margarina','arroz','feijao','macarrao','farinha','acucar','sal','oleo','azeite','vinagre',
  'molho','catchup','ketchup','mostarda','maionese','creme','biscoito','bolacha','pao',
  'bolo','cereal','aveia','granola','mel','chocolate','achocolatado','nescau','toddy',
  'banana','maca','laranja','tomate','cebola','alho','batata','cenoura','couve','alface',
  'carne','picanha','frango','linguica','salsicha','presunto','mortadela','bacon','ovo',
  'sabao','detergente','amaciante','desinfetante','agua','cerveja','refrigerante','vinho',
  'isotônico','isotonico','energetico','guaramcamp'
]);

function normalizarBuscaShared(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokenizarShared(texto: string): string[] {
  return normalizarBuscaShared(texto).split(' ').filter(t => t.length >= 2);
}
function classificarTokensShared(tokens: string[]): { ignoraveis: string[], comerciais: string[], criticos: string[] } {
  const ignoraveis: string[] = [], comerciais: string[] = [], criticos: string[] = [];
  for (const t of tokens) {
    if (STOP_WORDS_SHARED.has(t)) ignoraveis.push(t);
    else if (TOKENS_COMERCIAIS_SHARED.has(t) || REGEX_NUM_UNIDADE_SHARED.test(t)) comerciais.push(t);
    else criticos.push(t);
  }
  return { ignoraveis, comerciais, criticos };
}
function extrairTipoBaseShared(criticos: string[]): string | null {
  if (criticos.length === 0) return null;
  return criticos.find(t => TIPOS_BASE_CONHECIDOS_SHARED.has(t)) || criticos[0];
}
function temConflitoVarianteShared(criticosUsuario: string[], criticosEstoque: string[]): boolean {
  for (const grupo of GRUPOS_EXCLUSIVOS_SHARED) {
    const userNoGrupo = criticosUsuario.filter(t => grupo.includes(t));
    const estNoGrupo = criticosEstoque.filter(t => grupo.includes(t));
    if (userNoGrupo.length > 0 && estNoGrupo.length > 0) {
      const userSet = new Set(userNoGrupo);
      const estSet = new Set(estNoGrupo);
      if (![...userSet].some(t => estSet.has(t))) return true;
    }
  }
  return false;
}

type SharedMatchResult = { status: 'dominante', items: any[] } | { status: 'ambiguo', opcoes: any[] } | { status: 'nao_encontrado' };

function resolverMatchPorNucleo(produtoNome: string, todosItens: any[]): SharedMatchResult {
  const tokensUsuario = tokenizarShared(produtoNome);
  const { criticos: criticosUsuario } = classificarTokensShared(tokensUsuario);
  if (criticosUsuario.length === 0) return { status: 'nao_encontrado' };
  const tipoBase = extrairTipoBaseShared(criticosUsuario);
  const grupos = new Map<string, any[]>();
  for (const item of todosItens) {
    const chave = normalizarBuscaShared(item.produto_nome);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(item);
  }
  const candidatos: Array<{ chave: string, items: any[], score: number }> = [];
  for (const [chave, items] of grupos) {
    const tokensEst = tokenizarShared(items[0].produto_nome);
    const { criticos: criticosEst } = classificarTokensShared(tokensEst);
    if (tipoBase && !criticosEst.includes(tipoBase)) continue;
    if (temConflitoVarianteShared(criticosUsuario, criticosEst)) continue;
    const encontrados = criticosUsuario.filter(t => criticosEst.includes(t));
    const score = encontrados.length / criticosUsuario.length;
    candidatos.push({ chave, items, score });
  }
  const validos = candidatos.filter(c => c.score >= 0.8).sort((a, b) => b.score - a.score);
  if (validos.length === 0) return { status: 'nao_encontrado' };
  if (validos.length === 1) return { status: 'dominante', items: validos[0].items };
  const margem = validos[0].score - validos[1].score;
  if (margem >= 0.3) return { status: 'dominante', items: validos[0].items };
  const opcoes = validos.slice(0, 5).map(v => {
    const mais_recente = v.items.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
    const qtdTotal = v.items.reduce((s: number, r: any) => s + r.quantidade, 0);
    return { id: mais_recente.id, nome_completo: mais_recente.produto_nome, nome_consolidado: v.chave, quantidade_atual: qtdTotal, unidade: mais_recente.unidade_medida, marca: mais_recente.marca };
  });
  return { status: 'ambiguo', opcoes };
}
// ==================== FIM SHARED MATCHING ====================

// ==================== SHARED: CONVERSÃO DE UNIDADE ====================
function converterParaUnidadeBase(quantidade: number, unidadeOrigem: string, unidadeEstoque: string): { quantidade_convertida: number; converteu: boolean; erro?: string } {
  const orig = unidadeOrigem.toUpperCase().trim();
  const dest = unidadeEstoque.toUpperCase().trim();
  
  if (orig === dest) return { quantidade_convertida: quantidade, converteu: false };
  
  // Conversões canônicas
  if (orig === 'G' && dest === 'KG') return { quantidade_convertida: quantidade / 1000, converteu: true };
  if (orig === 'KG' && dest === 'G') return { quantidade_convertida: quantidade * 1000, converteu: true };
  if (orig === 'ML' && dest === 'L') return { quantidade_convertida: quantidade / 1000, converteu: true };
  if (orig === 'L' && dest === 'ML') return { quantidade_convertida: quantidade * 1000, converteu: true };
  
  // Unidades incompatíveis
  return { quantidade_convertida: quantidade, converteu: false, erro: `Não é possível converter ${orig} para ${dest} automaticamente.` };
}
// ==================== FIM CONVERSÃO DE UNIDADE ====================


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
    'criar_lista', 'adicionar_itens_lista', 'remover_item_lista', 'alterar_quantidade_item_lista',
    'ajustar_saldo_estoque'
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

        // Para resumo geral ("tudo") ou por categoria: buscar itens individuais para evitar alucinação
        // Mapeamento de sinônimos (mesmo do sistema inteiro)
        const sinonimoParaCanonico: Record<string, string> = {
          'açougue': 'açougue', 'acougue': 'açougue', 'carnes': 'açougue', 'carne': 'açougue', 'frango': 'açougue', 'frangos': 'açougue', 'peixe': 'açougue', 'peixes': 'açougue', 'bovino': 'açougue', 'suínos': 'açougue', 'suino': 'açougue',
          'bebidas': 'bebidas', 'bebida': 'bebidas', 'suco': 'bebidas', 'sucos': 'bebidas', 'refrigerante': 'bebidas', 'refrigerantes': 'bebidas', 'cerveja': 'bebidas', 'cervejas': 'bebidas', 'vinho': 'bebidas', 'vinhos': 'bebidas', 'água': 'bebidas', 'agua': 'bebidas',
          'hortifruti': 'hortifruti', 'hortfruti': 'hortifruti', 'hortifrute': 'hortifruti', 'frutas': 'hortifruti', 'verduras': 'hortifruti', 'legumes': 'hortifruti', 'hortaliças': 'hortifruti',
          'laticínios/frios': 'laticínios/frios', 'laticínios': 'laticínios/frios', 'laticinios': 'laticínios/frios', 'frios': 'laticínios/frios', 'queijo': 'laticínios/frios', 'queijos': 'laticínios/frios', 'embutidos': 'laticínios/frios', 'leite': 'laticínios/frios', 'iogurte': 'laticínios/frios', 'manteiga': 'laticínios/frios', 'requeijão': 'laticínios/frios',
          'higiene/farmácia': 'higiene/farmácia', 'higiene': 'higiene/farmácia', 'farmácia': 'higiene/farmácia', 'farmacia': 'higiene/farmácia', 'cuidados pessoais': 'higiene/farmácia',
          'mercearia': 'mercearia', 'arroz': 'mercearia', 'feijão': 'mercearia', 'feijao': 'mercearia', 'macarrão': 'mercearia', 'café': 'mercearia', 'farinha': 'mercearia',
          'padaria': 'padaria', 'pão': 'padaria', 'pao': 'padaria', 'pães': 'padaria', 'biscoito': 'padaria', 'biscoitos': 'padaria',
          'congelados': 'congelados', 'congelado': 'congelados', 'sorvete': 'congelados',
          'limpeza': 'limpeza', 'detergente': 'limpeza', 'sabão': 'limpeza', 'sabao': 'limpeza', 'desinfetante': 'limpeza', 'amaciante': 'limpeza',
          'pet': 'pet', 'animais': 'pet', 'ração': 'pet', 'racao': 'pet', 'cachorro': 'pet', 'gato': 'pet',
          'outros': 'outros', 'diversos': 'outros',
        };

        let queryEstoque = supabase.from('estoque_app')
          .select('id, produto_nome, quantidade, unidade_medida, categoria, marca, preco_unitario_ultimo, updated_at')
          .eq('user_id', usuarioId);

        if (args.tipo_busca === 'categoria' && args.termo) {
          const termoLower = args.termo.toLowerCase().trim();
          const categoriaBuscada = sinonimoParaCanonico[termoLower] || termoLower;
          queryEstoque = queryEstoque.ilike('categoria', `%${categoriaBuscada}%`);
        }

        const { data: dataEstoque, error: errEstoque } = await queryEstoque.order('produto_nome').limit(500);
        if (errEstoque) throw errEstoque;
        if (!dataEstoque || dataEstoque.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhum item encontrado no estoque.", itens: [] }), isWriteMutation: false };
        }

        // Consolidação por nome normalizado (mesma lógica do app e da busca por produto acima)
        const normNomeEstoque = (nome: string): string => {
          return nome.toUpperCase().trim().replace(/\s+/g, ' ').replace(/\bKG\b/gi, '').replace(/\bGRANEL\s+GRANEL\b/gi, 'GRANEL').replace(/\s+/g, ' ').trim();
        };
        const mapEstoque = new Map<string, any>();
        dataEstoque.forEach((item: any) => {
          const chave = normNomeEstoque(item.produto_nome);
          if (mapEstoque.has(chave)) {
            const ex = mapEstoque.get(chave);
            const novaQtd = ex.quantidade_total + item.quantidade;
            const maisRecente = new Date(item.updated_at) > new Date(ex.updated_at);
            mapEstoque.set(chave, {
              ...ex,
              id: maisRecente ? item.id : ex.id,
              quantidade_total: novaQtd,
              preco: maisRecente ? (item.preco_unitario_ultimo || ex.preco) : (ex.preco || item.preco_unitario_ultimo),
              categoria: maisRecente ? item.categoria : ex.categoria,
              updated_at: item.updated_at > ex.updated_at ? item.updated_at : ex.updated_at
            });
          } else {
            mapEstoque.set(chave, {
              id: item.id,
              nome: chave,
              nome_original: item.produto_nome,
              quantidade_total: item.quantidade,
              unidade: item.unidade_medida,
              categoria: item.categoria,
              marca: item.marca,
              preco: item.preco_unitario_ultimo,
              updated_at: item.updated_at
            });
          }
        });

        const itensConsolidadosEstoque = Array.from(mapEstoque.values())
          .filter((item: any) => item.quantidade_total > 0)
          .map((item: any) => ({
            id: item.id,
            nome: item.nome,
            quantidade: item.quantidade_total,
            unidade: item.unidade,
            categoria: item.categoria,
            marca: item.marca,
            preco: item.preco,
            atualizado: item.updated_at
          }));

        const valorTotalEstoque = itensConsolidadosEstoque.reduce((acc: number, item: any) => {
          return acc + Math.round(((item.preco || 0) * item.quantidade) * 100) / 100;
        }, 0);

        // Agrupar resumo por categoria para manter compatibilidade
        const resumoPorCat: Record<string, { total_itens: number; valor_pago: number }> = {};
        itensConsolidadosEstoque.forEach((item: any) => {
          const cat = item.categoria || 'outros';
          if (!resumoPorCat[cat]) resumoPorCat[cat] = { total_itens: 0, valor_pago: 0 };
          resumoPorCat[cat].total_itens++;
          resumoPorCat[cat].valor_pago += Math.round(((item.preco || 0) * item.quantidade) * 100) / 100;
        });

        return { result: JSON.stringify({
          total: itensConsolidadosEstoque.length,
          valor_total: Math.round(valorTotalEstoque * 100) / 100,
          itens: itensConsolidadosEstoque,
          resumo_por_categoria: Object.entries(resumoPorCat).map(([cat, v]) => ({
            categoria: cat,
            total_itens: v.total_itens,
            valor_pago: Math.round(v.valor_pago * 100) / 100,
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

      // ==================== SHARED: MATCHING POR NÚCLEO ====================
      // (extracted to shared scope for use by baixar/aumentar/ajustar_saldo)

      case 'baixar_estoque': {
        // Normalizar para array de itens
        const itensBaixa = args.itens && Array.isArray(args.itens) && args.itens.length > 0
          ? args.itens
          : [{ produto_nome: args.produto_nome, quantidade: args.quantidade, unidade: args.unidade, produto_id: args.produto_id }];

        if (!itensBaixa[0].produto_nome && !itensBaixa[0].produto_id) {
          return { result: JSON.stringify({ erro: "Nenhum produto informado para baixar." }), isWriteMutation: false };
        }

        const baixados: any[] = [];
        const baixaAmbiguos: any[] = [];
        const baixaNaoEncontrados: any[] = [];
        const baixaComProblema: any[] = [];

        for (const itemBaixa of itensBaixa) {
          const { produto_nome: pNome, quantidade: qtdBaixa, unidade: unidadePedida, produto_id: pId } = itemBaixa;
          try {
            // Step 1: ilike search
            let queryB = supabase.from('estoque_app')
              .select('id, produto_nome, quantidade, unidade_medida, marca, categoria, updated_at')
              .eq('user_id', usuarioId);
            if (pId) { queryB = queryB.eq('id', pId); }
            else { queryB = queryB.ilike('produto_nome', `%${pNome}%`); }
            const { data: matchesB, error: errB } = await queryB.limit(20);
            if (errB) throw errB;

            let finalMatchesB = matchesB || [];

            // Step 2: Fallback por núcleo
            if (finalMatchesB.length === 0 && !pId) {
              const { data: allStockB } = await supabase.from('estoque_app')
                .select('id, produto_nome, quantidade, unidade_medida, marca, categoria, updated_at')
                .eq('user_id', usuarioId).gt('quantidade', -1).limit(500);
              if (allStockB && allStockB.length > 0) {
                const resultadoB = resolverMatchPorNucleo(pNome, allStockB);
                if (resultadoB.status === 'dominante') {
                  finalMatchesB = resultadoB.items;
                  console.log(`🔍 [BAIXA-NUCLEO] "${pNome}" → match dominante: ${resultadoB.items[0]?.produto_nome}`);
                } else if (resultadoB.status === 'ambiguo') {
                  baixaAmbiguos.push({
                    produto_informado: pNome,
                    quantidade_pedida: qtdBaixa,
                    unidade_pedida: unidadePedida || null,
                    opcoes: resultadoB.opcoes.map((o: any, i: number) => ({
                      numero: i + 1,
                      id: o.id,
                      nome: o.nome_completo,
                      quantidade_atual: o.quantidade_atual,
                      unidade: o.unidade
                    })),
                    instrucao: "NÃO peça nome exato. Apresente as opções numeradas e pergunte qual o usuário quis dizer."
                  });
                  continue;
                } else {
                  baixaNaoEncontrados.push({
                    produto_informado: pNome,
                    instrucao: `Produto "${pNome}" não encontrado no estoque. Pergunte se o nome está correto. NÃO peça "nome exato".`
                  });
                  continue;
                }
              } else {
                baixaNaoEncontrados.push({
                  produto_informado: pNome,
                  instrucao: `Produto "${pNome}" não encontrado no estoque (estoque vazio). NÃO peça "nome exato".`
                });
                continue;
              }
            }

            if (finalMatchesB.length === 0) {
              baixaNaoEncontrados.push({
                produto_informado: pNome,
                instrucao: `Produto "${pNome}" não encontrado no estoque. Pergunte se o nome está correto. NÃO peça "nome exato".`
              });
              continue;
            }

            // Step 3: Consolidar por nome normalizado
            const gruposB = new Map<string, any[]>();
            finalMatchesB.forEach((m: any) => {
              const chave = normalizarBuscaShared(m.produto_nome);
              if (!gruposB.has(chave)) gruposB.set(chave, []);
              gruposB.get(chave)!.push(m);
            });

            if (gruposB.size > 1 && !pId) {
              const opcoesB = Array.from(gruposB.entries()).map(([_nome, regs], i) => {
                const qtdTotal = regs.reduce((s: number, r: any) => s + r.quantidade, 0);
                return { numero: i + 1, id: regs[0].id, nome: regs[0].produto_nome, quantidade_atual: qtdTotal, unidade: regs[0].unidade_medida };
              });
              baixaAmbiguos.push({
                produto_informado: pNome,
                quantidade_pedida: qtdBaixa,
                unidade_pedida: unidadePedida || null,
                opcoes: opcoesB,
                instrucao: "NÃO peça nome exato. Apresente as opções numeradas e pergunte qual o usuário quis dizer."
              });
              continue;
            }

            // Step 4: Match único — converter unidade e verificar saldo
            const grupoB = Array.from(gruposB.values())[0];
            const produtoB = grupoB.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
            const saldoAtualB = grupoB.reduce((s: number, r: any) => s + r.quantidade, 0);
            const unidadeEstoqueB = produtoB.unidade_medida;

            // Conversão de unidade antes da operação matemática
            let qtdConvertidaB = qtdBaixa;
            let unidadeEfetivaB = unidadePedida || unidadeEstoqueB;
            let converteuB = false;
            if (unidadePedida && unidadePedida.toUpperCase() !== unidadeEstoqueB.toUpperCase()) {
              const conv = converterParaUnidadeBase(qtdBaixa, unidadePedida, unidadeEstoqueB);
              if (conv.erro) {
                baixaComProblema.push({
                  produto: produtoB.produto_nome,
                  motivo: `${conv.erro} Estoque usa ${unidadeEstoqueB}, você informou ${unidadePedida}.`,
                  saldo_atual: saldoAtualB,
                  unidade: unidadeEstoqueB,
                  produto_id: produtoB.id
                });
                continue;
              }
              qtdConvertidaB = conv.quantidade_convertida;
              converteuB = conv.converteu;
              unidadeEfetivaB = unidadeEstoqueB;
            }

            // Arredondar para evitar erros de ponto flutuante
            qtdConvertidaB = Math.round(qtdConvertidaB * 10000) / 10000;

            if (qtdConvertidaB > saldoAtualB) {
              baixaComProblema.push({
                produto: produtoB.produto_nome,
                motivo: `Saldo insuficiente: tem ${saldoAtualB} ${unidadeEstoqueB}, mas você pediu para baixar ${qtdBaixa} ${unidadePedida || unidadeEstoqueB}${converteuB ? ` (= ${qtdConvertidaB} ${unidadeEstoqueB})` : ''}.`,
                saldo_atual: saldoAtualB,
                unidade: unidadeEstoqueB,
                produto_id: produtoB.id
              });
              continue;
            }

            // Step 5: Executar baixa — saldo_novo = saldo_atual - quantidade_convertida
            const novaQtdB = Math.round(Math.max(0, saldoAtualB - qtdConvertidaB) * 10000) / 10000;

            // Atualizar registro primário com o saldo novo total
            const { error: upErrB } = await supabase.from('estoque_app')
              .update({ quantidade: novaQtdB, updated_at: new Date().toISOString() })
              .eq('id', produtoB.id).eq('user_id', usuarioId);
            if (upErrB) throw upErrB;

            // Zerar registros secundários do grupo consolidado (reconciliação atômica)
            const idsSecundariosB = grupoB.filter((r: any) => r.id !== produtoB.id).map((r: any) => r.id);
            if (idsSecundariosB.length > 0) {
              const { error: zeroErrB } = await supabase.from('estoque_app')
                .update({ quantidade: 0, updated_at: new Date().toISOString() })
                .in('id', idsSecundariosB).eq('user_id', usuarioId);
              if (zeroErrB) console.error(`⚠️ [BAIXA] Erro ao zerar secundários: ${zeroErrB.message}`);
              else console.log(`🔄 [BAIXA] Zerados ${idsSecundariosB.length} registros secundários do grupo`);
            }

            baixados.push({
              produto: produtoB.produto_nome,
              saldo_anterior: saldoAtualB,
              quantidade_pedida: qtdBaixa,
              unidade_pedida: unidadePedida || unidadeEstoqueB,
              quantidade_convertida: qtdConvertidaB,
              unidade_estoque: unidadeEstoqueB,
              saldo_novo: novaQtdB,
              conversao_aplicada: converteuB,
              status: 'baixado'
            });
            console.log(`✅ [BAIXA] ${produtoB.produto_nome}: ${saldoAtualB} - ${qtdConvertidaB} = ${novaQtdB} ${unidadeEstoqueB}${converteuB ? ` (convertido de ${qtdBaixa} ${unidadePedida})` : ''}`);

          } catch (itemErr: any) {
            baixaComProblema.push({
              produto: pNome,
              motivo: `Erro ao processar: ${itemErr.message}`,
              saldo_atual: null,
              unidade: null
            });
          }
        }

        return {
          result: JSON.stringify({
            itens_baixados: baixados,
            itens_ambiguos: baixaAmbiguos,
            itens_nao_encontrados: baixaNaoEncontrados,
            itens_com_problema: baixaComProblema,
            instrucao_formatacao: "Apresente o resultado separado por categoria. Para itens_ambiguos, mostre opções numeradas. Para itens_com_problema, mostre o saldo atual. NÃO peça 'nome exato' em nenhum caso."
          }),
          isWriteMutation: baixados.length > 0
        };
      }

      case 'aumentar_estoque': {
        // Normalizar para array de itens
        const itensAumento = args.itens && Array.isArray(args.itens) && args.itens.length > 0
          ? args.itens
          : [{ produto_nome: args.produto_nome, quantidade: args.quantidade, unidade: args.unidade, produto_id: args.produto_id }];

        if (!itensAumento[0].produto_nome && !itensAumento[0].produto_id) {
          return { result: JSON.stringify({ erro: "Nenhum produto informado para aumentar." }), isWriteMutation: false };
        }

        const aumentados: any[] = [];
        const aumentoAmbiguos: any[] = [];
        const aumentoNaoEncontrados: any[] = [];
        const aumentoComProblema: any[] = [];

        for (const itemAumento of itensAumento) {
          const { produto_nome: pNomeA, quantidade: qtdAumento, unidade: unidadePedidaA, produto_id: pIdA } = itemAumento;
          try {
            let queryA = supabase.from('estoque_app')
              .select('id, produto_nome, quantidade, unidade_medida, marca, categoria, updated_at')
              .eq('user_id', usuarioId);
            if (pIdA) { queryA = queryA.eq('id', pIdA); }
            else { queryA = queryA.ilike('produto_nome', `%${pNomeA}%`); }
            const { data: matchesA, error: errA } = await queryA.limit(20);
            if (errA) throw errA;

            let finalMatchesA = matchesA || [];

            // Fallback por núcleo
            if (finalMatchesA.length === 0 && !pIdA) {
              const { data: allStockA } = await supabase.from('estoque_app')
                .select('id, produto_nome, quantidade, unidade_medida, marca, categoria, updated_at')
                .eq('user_id', usuarioId).gt('quantidade', -1).limit(500);
              if (allStockA && allStockA.length > 0) {
                const resultadoA = resolverMatchPorNucleo(pNomeA, allStockA);
                if (resultadoA.status === 'dominante') {
                  finalMatchesA = resultadoA.items;
                  console.log(`🔍 [AUMENTO-NUCLEO] "${pNomeA}" → match dominante: ${resultadoA.items[0]?.produto_nome}`);
                } else if (resultadoA.status === 'ambiguo') {
                  aumentoAmbiguos.push({
                    produto_informado: pNomeA,
                    quantidade_pedida: qtdAumento,
                    unidade_pedida: unidadePedidaA || null,
                    opcoes: resultadoA.opcoes.map((o: any, i: number) => ({
                      numero: i + 1, id: o.id, nome: o.nome_completo, quantidade_atual: o.quantidade_atual, unidade: o.unidade
                    })),
                    instrucao: "NÃO peça nome exato. Apresente as opções numeradas."
                  });
                  continue;
                } else {
                  aumentoNaoEncontrados.push({
                    produto_informado: pNomeA,
                    instrucao: `Produto "${pNomeA}" não encontrado no estoque. Pergunte se o nome está correto ou se deseja adicionar como produto novo. NÃO peça "nome exato".`
                  });
                  continue;
                }
              }
            }

            if (finalMatchesA.length === 0) {
              aumentoNaoEncontrados.push({
                produto_informado: pNomeA,
                instrucao: `Produto "${pNomeA}" não encontrado no estoque. Pergunte se o nome está correto ou se deseja adicionar como produto novo. NÃO peça "nome exato".`
              });
              continue;
            }

            // Consolidar
            const gruposA = new Map<string, any[]>();
            finalMatchesA.forEach((m: any) => {
              const chave = normalizarBuscaShared(m.produto_nome);
              if (!gruposA.has(chave)) gruposA.set(chave, []);
              gruposA.get(chave)!.push(m);
            });

            if (gruposA.size > 1 && !pIdA) {
              const opcoesA = Array.from(gruposA.entries()).map(([_nome, regs], i) => {
                const qtdTotal = regs.reduce((s: number, r: any) => s + r.quantidade, 0);
                return { numero: i + 1, id: regs[0].id, nome: regs[0].produto_nome, quantidade_atual: qtdTotal, unidade: regs[0].unidade_medida };
              });
              aumentoAmbiguos.push({
                produto_informado: pNomeA,
                quantidade_pedida: qtdAumento,
                unidade_pedida: unidadePedidaA || null,
                opcoes: opcoesA,
                instrucao: "NÃO peça nome exato. Apresente as opções numeradas."
              });
              continue;
            }

            const grupoA = Array.from(gruposA.values())[0];
            const produtoA = grupoA.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
            const saldoAtualA = grupoA.reduce((s: number, r: any) => s + r.quantidade, 0);
            const unidadeEstoqueA = produtoA.unidade_medida;

            // Conversão de unidade
            let qtdConvertidaA = qtdAumento;
            let converteuA = false;
            if (unidadePedidaA && unidadePedidaA.toUpperCase() !== unidadeEstoqueA.toUpperCase()) {
              const convA = converterParaUnidadeBase(qtdAumento, unidadePedidaA, unidadeEstoqueA);
              if (convA.erro) {
                aumentoComProblema.push({
                  produto: produtoA.produto_nome,
                  motivo: `${convA.erro} Estoque usa ${unidadeEstoqueA}, você informou ${unidadePedidaA}.`,
                  saldo_atual: saldoAtualA,
                  unidade: unidadeEstoqueA,
                  produto_id: produtoA.id
                });
                continue;
              }
              qtdConvertidaA = convA.quantidade_convertida;
              converteuA = convA.converteu;
            }

            qtdConvertidaA = Math.round(qtdConvertidaA * 10000) / 10000;
            const novaQtdA = Math.round((saldoAtualA + qtdConvertidaA) * 10000) / 10000;

            // Atualizar registro primário
            const { error: upErrA } = await supabase.from('estoque_app')
              .update({ quantidade: novaQtdA, updated_at: new Date().toISOString() })
              .eq('id', produtoA.id).eq('user_id', usuarioId);
            if (upErrA) throw upErrA;

            // Zerar secundários do grupo consolidado
            const idsSecundariosA = grupoA.filter((r: any) => r.id !== produtoA.id).map((r: any) => r.id);
            if (idsSecundariosA.length > 0) {
              const { error: zeroErrA } = await supabase.from('estoque_app')
                .update({ quantidade: 0, updated_at: new Date().toISOString() })
                .in('id', idsSecundariosA).eq('user_id', usuarioId);
              if (zeroErrA) console.error(`⚠️ [AUMENTO] Erro ao zerar secundários: ${zeroErrA.message}`);
              else console.log(`🔄 [AUMENTO] Zerados ${idsSecundariosA.length} registros secundários do grupo`);
            }

            aumentados.push({
              produto: produtoA.produto_nome,
              saldo_anterior: saldoAtualA,
              quantidade_pedida: qtdAumento,
              unidade_pedida: unidadePedidaA || unidadeEstoqueA,
              quantidade_convertida: qtdConvertidaA,
              unidade_estoque: unidadeEstoqueA,
              saldo_novo: novaQtdA,
              conversao_aplicada: converteuA,
              status: 'aumentado'
            });
            console.log(`✅ [AUMENTO] ${produtoA.produto_nome}: ${saldoAtualA} + ${qtdConvertidaA} = ${novaQtdA} ${unidadeEstoqueA}${converteuA ? ` (convertido de ${qtdAumento} ${unidadePedidaA})` : ''}`);

          } catch (itemErr: any) {
            aumentoComProblema.push({
              produto: pNomeA,
              motivo: `Erro ao processar: ${itemErr.message}`,
              saldo_atual: null,
              unidade: null
            });
          }
        }

        return {
          result: JSON.stringify({
            itens_aumentados: aumentados,
            itens_ambiguos: aumentoAmbiguos,
            itens_nao_encontrados: aumentoNaoEncontrados,
            itens_com_problema: aumentoComProblema,
            instrucao_formatacao: "Apresente o resultado separado por categoria. Para itens_ambiguos, mostre opções numeradas. NÃO peça 'nome exato' em nenhum caso."
          }),
          isWriteMutation: aumentados.length > 0
        };
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
        if (args.modo_resposta !== undefined) updateData.modo_resposta = args.modo_resposta;
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

          // Sem produto_id e sem item_livre — tentar resolver no catálogo antes de desistir
          console.log(`🔍 [fallback] "${item.produto_nome}" chegou sem produto_id. Tentando resolver no catálogo...`);
          const palavrasFallback = item.produto_nome.split(/\s+/).filter((p: string) => p.length >= 2);

          if (palavrasFallback.length > 0) {
            const { data: mastersFallback } = await supabase.rpc('buscar_produtos_master_por_palavras', {
              p_palavras: palavrasFallback, p_limite: 5
            });

            if (mastersFallback?.length === 1) {
              // 1 match claro — vincular automaticamente
              console.log(`✅ [fallback] "${item.produto_nome}" → match único: ${mastersFallback[0].nome_padrao} (${mastersFallback[0].id})`);
              itensParaInserir.push({
                lista_id: listaId,
                produto_nome: item.produto_nome,
                quantidade: item.quantidade || 1,
                unidade_medida: item.unidade_medida || 'UN',
                item_livre: false,
                produto_id: mastersFallback[0].id
              });
              continue;
            }

            if (mastersFallback && mastersFallback.length > 1) {
              // Múltiplas opções — perguntar ao usuário
              console.log(`⚠️ [fallback] "${item.produto_nome}" → ${mastersFallback.length} opções. Desambiguação necessária.`);
              itensPendentesDesambiguacao.push({
                produto_nome: item.produto_nome,
                quantidade: item.quantidade || 1,
                unidade_medida: item.unidade_medida || 'UN',
                origem_fluxo: 'fallback_sem_id',
                opcoes: mastersFallback.map((m: any) => ({
                  produto_id: m.id,
                  nome_padrao: m.nome_padrao,
                  marca: m.marca,
                  categoria: m.categoria
                }))
              });
              continue;
            }
          }

          // 0 resultados ou palavras insuficientes — pedir confirmação para item livre
          console.log(`❓ [fallback] "${item.produto_nome}" → sem correspondência no catálogo. Aguardando confirmação.`);
          itensPendentesConfirmacao.push({
            produto_nome: item.produto_nome,
            quantidade: item.quantidade || 1,
            unidade_medida: item.unidade_medida || 'UN',
            origem_fluxo: 'fallback_sem_id',
            motivo: `"${item.produto_nome}" não foi encontrado no catálogo. Deseja adicionar como item livre?`
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

      // ==================== REPORT TOOLS (Phase 3) ====================

      case 'consultar_relatorio': {
        const rpcParams: any = { p_user_id: usuarioId };
        if (args.data_inicio) rpcParams.p_data_inicio = args.data_inicio;
        if (args.data_fim) rpcParams.p_data_fim = args.data_fim;
        if (args.estabelecimento) rpcParams.p_estabelecimento = args.estabelecimento;
        if (args.categoria) rpcParams.p_categoria = args.categoria;
        if (args.produto) rpcParams.p_produto = args.produto;

        const { data: registros, error } = await supabase.rpc('relatorio_compras_usuario', rpcParams);
        if (error) throw error;

        if (!registros || registros.length === 0) {
          return { result: JSON.stringify({ mensagem: "Nenhuma compra encontrada com os filtros informados.", total_valor: 0, total_itens: 0, total_registros: 0 }), isWriteMutation: false };
        }

        // Calcular totais sobre TODOS os registros
        const totalValor = registros.reduce((acc: number, r: any) => acc + Number(r.valor_total || 0), 0);
        const totalItens = registros.length;

        // Resumo por categoria
        const porCategoria: Record<string, { total: number; itens: number }> = {};
        registros.forEach((r: any) => {
          const cat = r.categoria || 'Não categorizado';
          if (!porCategoria[cat]) porCategoria[cat] = { total: 0, itens: 0 };
          porCategoria[cat].total += Number(r.valor_total || 0);
          porCategoria[cat].itens++;
        });

        // Resumo por estabelecimento
        const porEstab: Record<string, { total: number; itens: number }> = {};
        registros.forEach((r: any) => {
          const est = r.estabelecimento || 'Não identificado';
          if (!porEstab[est]) porEstab[est] = { total: 0, itens: 0 };
          porEstab[est].total += Number(r.valor_total || 0);
          porEstab[est].itens++;
        });

        // Limitar listagem detalhada a 30 itens (mais recentes)
        const registrosOrdenados = registros.sort((a: any, b: any) => {
          const da = a.data_compra || '';
          const db = b.data_compra || '';
          return db.localeCompare(da);
        });
        const limite = 30;
        const itensExibidos = registrosOrdenados.slice(0, limite);

        const resultado: any = {
          total_valor: Math.round(totalValor * 100) / 100,
          total_itens: totalItens,
          total_registros: totalItens,
          resumo_por_categoria: Object.entries(porCategoria).map(([cat, v]) => ({
            categoria: cat,
            total: Math.round(v.total * 100) / 100,
            itens: v.itens
          })).sort((a, b) => b.total - a.total),
          resumo_por_estabelecimento: Object.entries(porEstab).map(([est, v]) => ({
            estabelecimento: est,
            total: Math.round(v.total * 100) / 100,
            itens: v.itens
          })).sort((a, b) => b.total - a.total),
          itens: itensExibidos.map((r: any) => ({
            data: r.data_compra,
            produto: r.produto,
            categoria: r.categoria,
            quantidade: Number(r.quantidade),
            valor_unitario: Number(r.valor_unitario),
            valor_total: Number(r.valor_total),
            estabelecimento: r.estabelecimento
          }))
        };

        if (totalItens > limite) {
          resultado.listagem_limitada = true;
          resultado.mensagem_limitacao = `Exibindo ${limite} de ${totalItens} registros. Os totais refletem TODOS os ${totalItens} registros.`;
        }

        return { result: JSON.stringify(resultado), isWriteMutation: false };
      }

      case 'listar_mercados_usuario': {
        const { data: mercados, error } = await supabase.rpc('listar_estabelecimentos_usuario', { p_user_id: usuarioId });
        if (error) throw error;
        return { result: JSON.stringify({ mercados: (mercados || []).map((m: any) => m.nome) }), isWriteMutation: false };
      }

      // ==================== FEEDBACK TOOL ====================
      case 'registrar_feedback': {
        console.log(`📋 [FEEDBACK] Tool registrar_feedback chamada — tipo: ${args.tipo}, mensagem: ${(args.mensagem || '').substring(0, 100)}`);
        
        const tiposValidos = ['erro', 'sugestao', 'reclamacao', 'duvida'];
        const tipo = tiposValidos.includes(args.tipo) ? args.tipo : 'duvida';
        
        // Buscar telefone do remetente via user_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('telefone')
          .eq('user_id', usuarioId)
          .maybeSingle();
        
        // Inserir feedback
        const { data: feedback, error: fbError } = await supabase
          .from('feedbacks')
          .insert({
            user_id: usuarioId,
            tipo,
            mensagem: args.mensagem,
            contexto: args.contexto || null,
            canal: 'whatsapp',
            telefone_whatsapp: profile?.telefone || null,
            session_id: null,
            status: 'novo',
            prioridade: tipo === 'erro' ? 'alta' : 'normal'
          })
          .select('id')
          .single();
        
        if (fbError) {
          console.error(`❌ [FEEDBACK] Erro ao salvar feedback:`, fbError);
          throw fbError;
        }
        
        console.log(`✅ [FEEDBACK] Feedback ${feedback.id} salvo com sucesso — tipo: ${tipo}, prioridade: ${tipo === 'erro' ? 'alta' : 'normal'}`);
        
        // Registrar confirmação automática da IA no histórico
        const { error: respError } = await supabase.from('feedbacks_respostas').insert({
          feedback_id: feedback.id,
          autor_id: null,
          autor_tipo: 'ia',
          mensagem: 'Feedback recebido e registrado automaticamente pelo assistente.',
          enviada_via_whatsapp: false
        });
        
        if (respError) {
          console.warn(`⚠️ [FEEDBACK] Feedback salvo mas erro ao registrar resposta automática:`, respError);
        } else {
          console.log(`✅ [FEEDBACK] Resposta automática da IA registrada em feedbacks_respostas`);
        }
        
        const tipoLabel: Record<string, string> = {
          erro: 'relato de erro',
          sugestao: 'sugestão',
          reclamacao: 'reclamação',
          duvida: 'dúvida'
        };
        
        return {
          result: JSON.stringify({
            sucesso: true,
            feedback_id: feedback.id,
            tipo: tipo,
            instrucao: `O feedback (${tipoLabel[tipo]}) foi registrado com sucesso. Responda ao usuário de forma acolhedora e simpática, confirmando que a mensagem foi recebida e que o time vai analisar com atenção. Diga que retornarão o mais rápido possível por este mesmo canal. Adapte o tom ao tipo de feedback (mais empático para erros/reclamações, mais entusiasta para sugestões).`
          }),
          isWriteMutation: false
        };
      }

      // ==================== PREFERENCES TOOLS ====================
      case 'gerenciar_preferencias_mensagens': {
        // Identificar o telefone remetente
        // 'remetente' está disponível no escopo da handler function, mas não aqui.
        // Precisamos passar o remetente como contexto extra. Vamos usar a busca por usuario_id + telefone ativo.
        const telefoneLimpo = (args._remetente || '').replace(/[^0-9]/g, '');
        
        const { data: telData, error: telError } = await supabase
          .from('whatsapp_telefones_autorizados')
          .select('id, pref_promocoes, pref_novidades, pref_avisos_estoque, pref_dicas, nome_pessoa')
          .eq('usuario_id', usuarioId)
          .eq('verificado', true)
          .eq('ativo', true);
        
        if (telError) throw telError;
        
        // Encontrar pelo número normalizado
        let telefoneAlvo = (telData || []).find((t: any) => 
          t.numero_whatsapp?.replace(/[^0-9]/g, '') === telefoneLimpo
        );
        
        // Fallback: se não encontrou pelo número, usar o primeiro verificado
        if (!telefoneAlvo && telData && telData.length > 0) {
          telefoneAlvo = telData[0];
        }
        
        if (!telefoneAlvo) {
          return { result: JSON.stringify({ erro: "Nenhum telefone verificado encontrado para esta conta." }), isWriteMutation: false };
        }
        
        const modo = args.modo || 'definir';
        const updateFields: any = {};
        
        if (modo === 'exclusivo') {
          // Desativar tudo primeiro, depois ativar apenas as informadas
          updateFields.pref_promocoes = args.pref_promocoes === true;
          updateFields.pref_novidades = args.pref_novidades === true;
          updateFields.pref_avisos_estoque = args.pref_avisos_estoque === true;
          updateFields.pref_dicas = args.pref_dicas === true;
        } else {
          // Modo definir: alterar apenas as informadas
          if (args.pref_promocoes !== undefined) updateFields.pref_promocoes = args.pref_promocoes;
          if (args.pref_novidades !== undefined) updateFields.pref_novidades = args.pref_novidades;
          if (args.pref_avisos_estoque !== undefined) updateFields.pref_avisos_estoque = args.pref_avisos_estoque;
          if (args.pref_dicas !== undefined) updateFields.pref_dicas = args.pref_dicas;
        }
        
        const { error: updError } = await supabase
          .from('whatsapp_telefones_autorizados')
          .update(updateFields)
          .eq('id', telefoneAlvo.id);
        
        if (updError) throw updError;
        
        // Buscar estado final
        const { data: estadoFinal } = await supabase
          .from('whatsapp_telefones_autorizados')
          .select('pref_promocoes, pref_novidades, pref_avisos_estoque, pref_dicas, nome_pessoa')
          .eq('id', telefoneAlvo.id)
          .single();
        
        return {
          result: JSON.stringify({
            sucesso: true,
            estado_final: {
              promocoes: estadoFinal?.pref_promocoes ?? true,
              novidades: estadoFinal?.pref_novidades ?? true,
              avisos_estoque: estadoFinal?.pref_avisos_estoque ?? true,
              dicas: estadoFinal?.pref_dicas ?? true
            },
            nome_pessoa: estadoFinal?.nome_pessoa || null,
            instrucao: "OBRIGATÓRIO: Confirme ao usuário o estado final completo de TODAS as 4 preferências, listando explicitamente o que ficou ✅ ativo e o que ficou ❌ desativado neste número."
          }),
          isWriteMutation: false
        };
      }

      case 'consultar_preferencias_mensagens': {
        const { data: telData, error: telError } = await supabase
          .from('whatsapp_telefones_autorizados')
          .select('pref_promocoes, pref_novidades, pref_avisos_estoque, pref_dicas, nome_pessoa, numero_whatsapp')
          .eq('usuario_id', usuarioId)
          .eq('verificado', true)
          .eq('ativo', true);
        
        if (telError) throw telError;
        
        if (!telData || telData.length === 0) {
          return { result: JSON.stringify({ erro: "Nenhum telefone verificado encontrado." }), isWriteMutation: false };
        }
        
        // Retornar preferências de todos os telefones verificados
        const preferencias = telData.map((t: any) => ({
          numero: t.numero_whatsapp,
          nome_pessoa: t.nome_pessoa || null,
          promocoes: t.pref_promocoes,
          novidades: t.pref_novidades,
          avisos_estoque: t.pref_avisos_estoque,
          dicas: t.pref_dicas
        }));
        
        return {
          result: JSON.stringify({
            sucesso: true,
            telefones: preferencias,
            instrucao: "Liste as preferências de forma clara para o usuário, usando ✅ para ativo e ❌ para desativado."
          }),
          isWriteMutation: false
        };
      }

      case 'atualizar_nome_telefone': {
        const telefoneLimpoNome = (args._remetente || '').replace(/[^0-9]/g, '');
        
        const { data: telData } = await supabase
          .from('whatsapp_telefones_autorizados')
          .select('id, numero_whatsapp')
          .eq('usuario_id', usuarioId)
          .eq('verificado', true)
          .eq('ativo', true);
        
        let telefoneAlvoNome = (telData || []).find((t: any) => 
          t.numero_whatsapp?.replace(/[^0-9]/g, '') === telefoneLimpoNome
        );
        
        if (!telefoneAlvoNome && telData && telData.length > 0) {
          telefoneAlvoNome = telData[0];
        }
        
        if (!telefoneAlvoNome) {
          return { result: JSON.stringify({ erro: "Nenhum telefone verificado encontrado." }), isWriteMutation: false };
        }
        
        const { error: updNomeError } = await supabase
          .from('whatsapp_telefones_autorizados')
          .update({ nome_pessoa: args.nome_pessoa })
          .eq('id', telefoneAlvoNome.id);
        
        if (updNomeError) throw updNomeError;
        
        return {
          result: JSON.stringify({
            sucesso: true,
            nome_pessoa: args.nome_pessoa,
            instrucao: `Confirme ao usuário que o nome deste telefone foi atualizado para "${args.nome_pessoa}".`
          }),
          isWriteMutation: false
        };
      }

      case 'ajustar_saldo_estoque': {
        if (!args.itens || !Array.isArray(args.itens) || args.itens.length === 0) {
          return { result: JSON.stringify({ erro: "Nenhum item fornecido para ajustar." }), isWriteMutation: false };
        }

        const normNomeSaldo = (nome: string): string => {
          return nome.toUpperCase().trim().replace(/\s+/g, ' ').replace(/\bKG\b/gi, '').replace(/\bGRANEL\s+GRANEL\b/gi, 'GRANEL').replace(/\s+/g, ' ').trim();
        };

        // Usa matching por núcleo compartilhado (definido no escopo global)
        // Aliases locais para retrocompatibilidade do código existente
        const normalizarBusca = normalizarBuscaShared;
        const tokenizar = tokenizarShared;
        const classificarTokens = classificarTokensShared;

        // Conversões canônicas autorizadas (lista fechada)
        const conversoesCanonICAS: Record<string, Record<string, number>> = {
          'G': { 'KG': 0.001 }, 'KG': { 'G': 1000 },
          'ML': { 'L': 0.001 }, 'L': { 'ML': 1000 },
        };

        const itensAjustados: any[] = [];
        const itensAmbiguos: any[] = [];
        const itensPendentes: any[] = [];
        const itensNaoEncontrados: any[] = [];
        const avisos: string[] = [];

        for (const item of args.itens) {
          const { produto_nome, novo_saldo, unidade, produto_id } = item;

          // Buscar no estoque
          let queryEst = supabase.from('estoque_app')
            .select('id, produto_nome, quantidade, unidade_medida, marca, categoria, updated_at')
            .eq('user_id', usuarioId);

          if (produto_id) {
            queryEst = queryEst.eq('id', produto_id);
          } else {
            queryEst = queryEst.ilike('produto_nome', `%${produto_nome}%`);
          }

          const { data: matches, error: estErr } = await queryEst.limit(20);
          if (estErr) throw estErr;

          // === PARTE 2: Fallback por matching inteligente por núcleo ===
          let finalMatches = matches || [];
          let criterioFallback = false;
          if (finalMatches.length === 0 && !produto_id) {
            const { data: allStock } = await supabase.from('estoque_app')
              .select('id, produto_nome, quantidade, unidade_medida, marca, categoria, updated_at')
              .eq('user_id', usuarioId)
              .gt('quantidade', -1)
              .limit(500);
            if (allStock && allStock.length > 0) {
              const resultado = resolverMatchPorNucleo(produto_nome, allStock);
              if (resultado.status === 'dominante') {
                finalMatches = resultado.items;
                criterioFallback = true;
                console.log(`🔍 [NUCLEO] "${produto_nome}" → match dominante: ${resultado.items[0]?.produto_nome}`);
              } else if (resultado.status === 'ambiguo') {
                itensAmbiguos.push({ nome: produto_nome, opcoes: resultado.opcoes });
                console.log(`🔍 [NUCLEO] "${produto_nome}" → ambíguo (${resultado.opcoes.length} opções)`);
                continue;
              } else {
                console.log(`🔍 [NUCLEO] "${produto_nome}" → não encontrado`);
              }
            }
          }

          if (finalMatches.length === 0) {
            itensNaoEncontrados.push({ nome: produto_nome });
            continue;
          }

          // Consolidar por nome normalizado para contar matches reais
          const gruposConsolidados = new Map<string, any[]>();
          finalMatches.forEach((m: any) => {
            const chave = normNomeSaldo(m.produto_nome);
            if (!gruposConsolidados.has(chave)) gruposConsolidados.set(chave, []);
            gruposConsolidados.get(chave)!.push(m);
          });

          if (gruposConsolidados.size > 1 && !produto_id) {
            // Múltiplos produtos distintos — ambíguo
            const opcoes = Array.from(gruposConsolidados.entries()).map(([nome, registros]) => {
              const qtdTotal = registros.reduce((s: number, r: any) => s + r.quantidade, 0);
              const maisRecente = registros.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
              return {
                id: maisRecente.id,
                nome_completo: maisRecente.produto_nome,
                nome_consolidado: nome,
                quantidade_atual: qtdTotal,
                unidade: maisRecente.unidade_medida,
                marca: maisRecente.marca
              };
            });
            itensAmbiguos.push({ nome: produto_nome, opcoes });
            continue;
          }

          // 1 grupo consolidado (ou produto_id exato)
          const grupo = Array.from(gruposConsolidados.values())[0];
          const registroPrimario = grupo.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
          const saldoAnterior = grupo.reduce((s: number, r: any) => s + r.quantidade, 0);
          const unidadeEstoque = registroPrimario.unidade_medida?.toUpperCase() || 'UN';
          const unidadeRaw = (unidade || '').toUpperCase();

          // === HERANÇA DE UNIDADE ===
          // Saldo zero: bypass total — herdar unidade do estoque, ignorar qualquer unidade recebida
          // Unidade ausente: herdar do estoque
          let unidadeInformada: string;
          let saldoFinal = novo_saldo;
          let criterio = produto_id ? 'produto_id_exato' : (criterioFallback ? 'match_nucleo_dominante' : 'nome_unico_seguro');

          if (novo_saldo === 0) {
            // Bypass total: herdar unidade, sem validação, sem conversão, sem pendência
            unidadeInformada = unidadeEstoque;
            console.log(`🔄 [UNIDADE] Saldo zero para "${produto_nome}" — herdando unidade do estoque: ${unidadeEstoque}`);
          } else if (!unidadeRaw) {
            // Unidade não informada com saldo > 0: herdar do estoque
            unidadeInformada = unidadeEstoque;
            console.log(`🔄 [UNIDADE] Unidade ausente para "${produto_nome}" — herdando do estoque: ${unidadeEstoque}`);
          } else {
            // Unidade informada explicitamente com saldo > 0: verificar compatibilidade
            unidadeInformada = unidadeRaw;
            if (unidadeInformada !== unidadeEstoque) {
              // Tentar conversão canônica
              const conv = conversoesCanonICAS[unidadeInformada]?.[unidadeEstoque];
              if (conv !== undefined) {
                saldoFinal = novo_saldo * conv;
                criterio = 'conversao_canonica';
                avisos.push(`"${produto_nome}": convertido de ${novo_saldo} ${unidadeInformada} para ${saldoFinal} ${unidadeEstoque}`);
              } else {
                // Conversão não canônica — pendente
                itensPendentes.push({
                  nome: produto_nome,
                  motivo: `Unidade informada (${unidadeInformada}) incompatível com estoque (${unidadeEstoque}). Conversão não autorizada automaticamente.`
                });
                continue;
              }
            }
          }

          // === PARTE 3 + 4: Trava de plausibilidade e detecção de unidade errada ===
          const limites: Record<string, number> = { 'KG': 50, 'L': 50, 'UN': 200, 'G': 50000, 'ML': 50000 };
          const limiteUnidade = limites[unidadeEstoque] || limites[unidadeInformada];
          if (limiteUnidade && saldoFinal > limiteUnidade) {
            // Detectar possível erro de unidade (ex: 500 KG provavelmente é 500g = 0.5 KG)
            let sugestao = '';
            if (unidadeEstoque === 'KG' && saldoFinal >= 100) {
              const provavel = saldoFinal / 1000;
              sugestao = ` Talvez você quisesse dizer ${saldoFinal} g = ${provavel} kg?`;
            } else if (unidadeEstoque === 'L' && saldoFinal >= 100) {
              const provavel = saldoFinal / 1000;
              sugestao = ` Talvez você quisesse dizer ${saldoFinal} ml = ${provavel} L?`;
            }
            itensPendentes.push({
              nome: produto_nome,
              motivo: `Quantidade ${saldoFinal} ${unidadeEstoque} parece muito alta para uso doméstico.${sugestao} Confirme o valor correto.`,
              confirmar: true,
              produto_encontrado: { id: registroPrimario.id, nome: registroPrimario.produto_nome, quantidade_atual: saldoAnterior, unidade: unidadeEstoque }
            });
            console.log(`⚠️ [PLAUSIBILIDADE] Bloqueado: ${produto_nome} → ${saldoFinal} ${unidadeEstoque} (limite: ${limiteUnidade})`);
            continue;
          }

          // Se busca foi por nome genérico (sem produto_id), verificar se é realmente seguro
          if (!produto_id) {
            // Usar tokens críticos para avaliar genericidade (não palavras brutas)
            const tokensCriticosInfo = classificarTokens(tokenizar(produto_nome)).criticos;
            const tokensCriticosEst = classificarTokens(tokenizar(registroPrimario.produto_nome)).criticos;
            if (tokensCriticosInfo.length <= 1 && tokensCriticosEst.length >= 3) {
              // Nome com 1 token crítico (ex: "leite", "café") vs nome detalhado — pedir confirmação
              itensPendentes.push({
                nome: produto_nome,
                motivo: `Encontrei "${registroPrimario.produto_nome}" (${saldoAnterior} ${unidadeEstoque}). É este o item que você quer ajustar para ${novo_saldo} ${unidadeInformada}?`,
                confirmar: true,
                produto_encontrado: { id: registroPrimario.id, nome: registroPrimario.produto_nome, quantidade_atual: saldoAnterior, unidade: unidadeEstoque }
              });
              continue;
            }
          }

          // Executar o ajuste — atualizar primário e zerar secundários
          const { error: upErr } = await supabase.from('estoque_app')
            .update({ quantidade: saldoFinal, updated_at: new Date().toISOString() })
            .eq('id', registroPrimario.id)
            .eq('user_id', usuarioId);
          if (upErr) throw upErr;

          // Zerar registros secundários do mesmo grupo
          const idsSecundarios = grupo.filter((r: any) => r.id !== registroPrimario.id).map((r: any) => r.id);
          if (idsSecundarios.length > 0) {
            const { error: zeroErr } = await supabase.from('estoque_app')
              .update({ quantidade: 0, updated_at: new Date().toISOString() })
              .in('id', idsSecundarios);
            if (zeroErr) console.error('⚠️ Erro ao zerar secundários:', zeroErr);
          }

          itensAjustados.push({
            nome: registroPrimario.produto_nome,
            saldo_anterior: saldoAnterior,
            saldo_novo: saldoFinal,
            unidade: unidadeEstoque,
            criterio_autorizacao: criterio
          });

          console.log(`✅ [SALDO] ${registroPrimario.produto_nome}: ${saldoAnterior} → ${saldoFinal} ${unidadeEstoque} (criterio: ${criterio})`);
        }

        return {
          result: JSON.stringify({
            itens_ajustados: itensAjustados,
            itens_ambiguos: itensAmbiguos,
            itens_pendentes: itensPendentes,
            itens_nao_encontrados: itensNaoEncontrados.map(i => ({
              ...i,
              instrucao: "Produto não encontrado no estoque. Pergunte se o nome está correto ou liste candidatos próximos. NÃO ofereça criar item livre neste contexto."
            })),
            avisos
          }),
          isWriteMutation: itensAjustados.length > 0
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

async function sendWhatsAppMessage(phone: string, message: string, delayTyping?: number): Promise<boolean> {
  const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
  const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
  const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
  
  if (!instanceUrl || !apiToken) {
    console.error('❌ WhatsApp credentials missing');
    return false;
  }
  
  try {
    const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;
    const payload: Record<string, unknown> = { phone, message };
    if (delayTyping && delayTyping > 0) {
      payload.delayTyping = delayTyping;
    }
    console.log(`📤 [SEND] delayTyping=${delayTyping ?? 0}s | phone=${phone}`);
    const response = await fetch(sendTextUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accountSecret ? { 'Client-Token': accountSecret } : {})
      },
      body: JSON.stringify(payload)
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

// ==================== SEND WHATSAPP AUDIO ====================

async function sendWhatsAppAudio(phone: string, audioBase64: string): Promise<boolean> {
  const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
  const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
  const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
  
  if (!instanceUrl || !apiToken) {
    console.error('❌ WhatsApp credentials missing for audio');
    return false;
  }
  
  try {
    const sendAudioUrl = `${instanceUrl}/token/${apiToken}/send-audio`;
    const response = await fetch(sendAudioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accountSecret ? { 'Client-Token': accountSecret } : {})
      },
      body: JSON.stringify({
        phone,
        audio: audioBase64,
        waveform: true
      })
    });
    
    if (!response.ok) {
      console.error('❌ Erro Z-API audio:', await response.text());
      return false;
    }
    
    console.log('✅ Áudio enviado via Z-API');
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar áudio:', error);
    return false;
  }
}


// ==================== GENERATE TTS ====================

async function generateTTS(text: string): Promise<string | null> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.error('❌ OPENAI_API_KEY não configurada para TTS');
    return null;
  }

  // Limitar texto para TTS (mensagens longas ficam inviáveis em áudio)
  const textoParaAudio = text.length > 2000 ? text.substring(0, 2000) + '...' : text;
  
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: PICOTINHO_VOICE.model,
        input: textoParaAudio,
        voice: PICOTINHO_VOICE.voice,
        speed: PICOTINHO_VOICE.speed,
        response_format: 'mp3'
      })
    });
    
    if (!response.ok) {
      console.error('❌ OpenAI TTS erro:', response.status, await response.text());
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = 'data:audio/mpeg;base64,' + btoa(binary);
    console.log(`✅ TTS gerado: ${bytes.length} bytes (${textoParaAudio.length} chars de texto)`);
    return base64Audio;
  } catch (error) {
    console.error('❌ Erro ao gerar TTS:', error);
    return null;
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
        await sendWhatsAppMessage(remetente, erroMsg, DELAY_TYPING.FALLBACK);
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
          await sendWhatsAppMessage(remetente, falhaMsg, DELAY_TYPING.FALLBACK);
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
        await sendWhatsAppMessage(remetente, erroMsg, DELAY_TYPING.FALLBACK);
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
    const modoResposta = preferencias?.modo_resposta || 'texto';
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
            const snapContexto = snap.contexto || 'adicionar_item_lista';
            // Gerar instrução dinâmica baseada no contexto do snapshot
            if (snapContexto === 'baixar_estoque') {
              const snapExtra = snap as any;
              contextoEscolhaInjetado = `[CONTEXTO ESTRUTURADO — USE EXATAMENTE ESTES DADOS] O usuário escolheu a opção ${numeroEscolhido} para BAIXAR estoque. O produto_id correspondente é "${opcaoEscolhida.produto_id}". O nome do produto é "${opcaoEscolhida.nome}". Use este produto_id EXATO ao chamar baixar_estoque com quantidade ${snapExtra.quantidade_pendente || 'a mesma informada anteriormente'} e unidade ${snapExtra.unidade_pendente || 'a mesma do estoque'}. NÃO busque novamente.`;
            } else if (snapContexto === 'aumentar_estoque') {
              const snapExtra = snap as any;
              contextoEscolhaInjetado = `[CONTEXTO ESTRUTURADO — USE EXATAMENTE ESTES DADOS] O usuário escolheu a opção ${numeroEscolhido} para AUMENTAR estoque. O produto_id correspondente é "${opcaoEscolhida.produto_id}". O nome do produto é "${opcaoEscolhida.nome}". Use este produto_id EXATO ao chamar aumentar_estoque com quantidade ${snapExtra.quantidade_pendente || 'a mesma informada anteriormente'} e unidade ${snapExtra.unidade_pendente || 'a mesma do estoque'}. NÃO busque novamente.`;
            } else if (snapContexto === 'ajustar_saldo_estoque') {
              contextoEscolhaInjetado = `[CONTEXTO ESTRUTURADO — USE EXATAMENTE ESTES DADOS] O usuário escolheu a opção ${numeroEscolhido}. O produto_id correspondente é "${opcaoEscolhida.produto_id}". O nome do produto é "${opcaoEscolhida.nome}". Use este produto_id EXATO ao chamar ajustar_saldo_estoque. NÃO busque novamente. O contexto da ação é: ${snapContexto}.`;
            } else {
              contextoEscolhaInjetado = `[CONTEXTO ESTRUTURADO — USE EXATAMENTE ESTES DADOS] O usuário escolheu a opção ${numeroEscolhido}. O produto_id correspondente é "${opcaoEscolhida.produto_id}". O nome do produto é "${opcaoEscolhida.nome}". Use este produto_id EXATO ao chamar adicionar_itens_lista. NÃO busque novamente no catálogo. O contexto da ação é: ${snapContexto}${snap.lista_id ? ` na lista ${snap.lista_id}` : ''}.`;
            }
            console.log(`✅ [SNAPSHOT] Escolha ${numeroEscolhido} resolvida → produto_id: ${opcaoEscolhida.produto_id}, nome: ${opcaoEscolhida.nome}, contexto: ${snapContexto}`);
          } else {
            contextoEscolhaInjetado = `O usuário respondeu "${conteudo}" mas a opção ${numeroEscolhido} não existe. As opções válidas eram de 1 a ${snap.opcoes.length}. Informe o usuário e reapresente as opções: ${snap.opcoes.map(o => `${o.numero}. ${o.nome}`).join(', ')}.`;
            console.log(`⚠️ [SNAPSHOT] Opção ${numeroEscolhido} fora do range (1-${snap.opcoes.length})`);
          }
          // Limpar snapshot após uso
          await supabase.from('whatsapp_preferencias_usuario').update({ opcoes_pendentes: null }).eq('usuario_id', usuarioId);
        } else if (numeroEscolhido === null) {
          // Verificar se é confirmação de inventário em lote
          if (snap.contexto === 'inventario_lote' && /^\s*(?:pode\s+ajustar|confirmar?|finalizar?(?:\s+inventário)?|sim|pode|ok|isso|confirma)\s*$/i.test(conteudo)) {
            // Confirmação de inventário em lote — injetar instrução para executar
            const itensLote = (snap as any).itens || [];
            contextoEscolhaInjetado = `[CONTEXTO ESTRUTURADO — INVENTÁRIO EM LOTE CONFIRMADO] O usuário confirmou o ajuste de inventário. Execute ajustar_saldo_estoque com EXATAMENTE estes itens (NÃO reinterprete, NÃO recalcule, NÃO acrescente): ${JSON.stringify(itensLote)}. Use os produto_id fornecidos.`;
            console.log(`✅ [SNAPSHOT] Confirmação de inventário em lote detectada — ${itensLote.length} itens`);
            await supabase.from('whatsapp_preferencias_usuario').update({ opcoes_pendentes: null }).eq('usuario_id', usuarioId);
          } else {
            // Mensagem não é escolha numérica nem confirmação — usuário mudou de assunto, limpar snapshot
            console.log('🔄 [SNAPSHOT] Mensagem não é escolha numérica nem confirmação, limpando opções pendentes.');
            await supabase.from('whatsapp_preferencias_usuario').update({ opcoes_pendentes: null }).eq('usuario_id', usuarioId);
          }
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

Regras de Relatórios:
26. Use consultar_relatorio para QUALQUER pergunta sobre gastos, compras passadas, relatórios, "quanto comprei", "o que comprei", "resuma minhas compras".
27. Interprete períodos naturais e converta para YYYY-MM-DD:
    - "este mês" → primeiro dia do mês atual até hoje
    - "mês passado" → primeiro e último dia do mês anterior
    - "este ano" → 01/01 do ano atual até hoje
    - "ano passado" → 01/01 a 31/12 do ano anterior
    - "último trimestre" → 3 meses atrás até hoje
    - "entre janeiro e março" → 01/01 a 31/03 do ano atual
    - "ontem", "esta semana" → calcule as datas corretas
    Data de referência: ${new Date().toISOString().split('T')[0]}
28. PERÍODO NÃO É OBRIGATÓRIO. Se o usuário não especificar período:
    - Para consultas genéricas ("quanto comprei de arroz?"), execute a busca em TODO o histórico.
    - Ao responder, mencione que o resultado abrange todo o histórico disponível.
    - Se o resultado for muito amplo, SUGIRA ao usuário restringir por período, mas NÃO trave a consulta.
29. Categorias válidas para relatório: mercearia, bebidas, hortifruti, limpeza, açougue, laticínios/frios, higiene/farmácia, padaria, congelados, pet, outros.
    Sinônimos: "material de limpeza"/"produtos de limpeza" → limpeza, "carnes" → açougue, "frutas"/"verduras" → hortifruti, "frios" → laticínios/frios, "higiene" → higiene/farmácia.
30. SEMPRE use listar_mercados_usuario ANTES de consultar_relatorio quando o usuário mencionar um mercado. Compare o nome falado com a lista retornada e use o nome exato do sistema. Isso evita problemas com nomes como "Costa Azul" vs "COSTAZUL".
31. Formato da resposta:
    - "quanto comprei/gastei" → responda com TOTAL consolidado
    - "o que comprei/quais produtos" → responda com LISTAGEM de itens
    - "resuma/resumo" → responda com RESUMO por categoria ou mercado
32. Quando a listagem for limitada (mais de 30 itens), SEMPRE informe: o total consolidado (soma de TODOS os registros), seguido da indicação de quantos itens foram listados vs total real. Exemplo: "Total: R$ 450,00 em 85 itens. Listei os 30 mais recentes."
33. NUNCA invente valores. Toda resposta deve vir da tool consultar_relatorio.

REGRA CRÍTICA ANTI-ALUCINAÇÃO (ESTOQUE E RELATÓRIOS):
36. NUNCA liste nomes de produtos que NÃO apareceram EXPLICITAMENTE no retorno da tool.
    Se a tool retornar apenas totais sem nomes de itens, diga o total e informe que pode detalhar — MAS NUNCA INVENTE nomes de produtos.
    Toda resposta sobre estoque DEVE conter EXCLUSIVAMENTE dados retornados pela tool.
    Se a tool retornar 0 itens, diga que não encontrou. NUNCA preencha com exemplos ou suposições.

Regras de Modo de Resposta:
34. O usuário pode pedir para mudar o modo de resposta com frases como:
    "quero que você me responda por áudio", "prefiro texto", "me responda falando",
    "responde em áudio e texto", "volta pra texto", "pode falar comigo".
    Quando detectar esse pedido, use salvar_preferencia com modo_resposta.
    Valores: "texto", "audio", "ambos".
35. Modo de resposta atual do usuário: ${modoResposta}. Respeite-o em todas as interações. Se for "audio" ou "ambos", avise o usuário que suas respostas serão enviadas também por áudio.

Regras de Feedback e Suporte (OBRIGATÓRIAS — LEIA COM ATENÇÃO):
36. OBRIGATÓRIO: Quando o usuário expressar qualquer feedback sobre o sistema Picotinho (erro, sugestão, reclamação, dúvida sobre o app), você DEVE OBRIGATORIAMENTE chamar a tool registrar_feedback ANTES de responder. É TERMINANTEMENTE PROIBIDO responder ao usuário dizendo que registrou, anotou, encaminhou ou recebeu o feedback sem ter executado a tool registrar_feedback com sucesso.
37. Frases-gatilho (exemplos, não exaustivos): "quero reportar", "tenho uma sugestão", "não funcionou", "quero reclamar", "achei um erro", "o sistema não fez", "tenho uma dúvida sobre o app", "como funciona o Picotinho", "o que vocês podem melhorar", "não apareceu", "travou", "deu problema", "não consegui", "seria melhor se", "bug", "problema no sistema", "isso tá errado", "não tá funcionando", "deu erro", "poderia ter", "falta um", "cadê o", "sumiu", "não carregou", "não atualizou".
38. Classifique automaticamente o tipo: erro (bugs, falhas, algo que não funcionou, não apareceu, travou), sugestao (melhorias, ideias, funcionalidades novas, "seria melhor se", "poderia ter"), reclamacao (insatisfação com o serviço), duvida (como usar, o que faz, como funciona).
39. EXEMPLOS CORRETOS (faça assim):
    - Usuário: "o estoque não atualizou direito" → chamar registrar_feedback(tipo="erro", mensagem="Estoque não atualizou corretamente")
    - Usuário: "seria legal ter um relatório mensal" → chamar registrar_feedback(tipo="sugestao", mensagem="Sugestão de relatório mensal")
    - Usuário: "não gostei de como funciona a lista" → chamar registrar_feedback(tipo="reclamacao", mensagem="Insatisfação com funcionamento da lista")
    - Usuário: "como faço pra usar o cardápio?" → chamar registrar_feedback(tipo="duvida", mensagem="Dúvida sobre como usar o cardápio")
    - Usuário: "não apareceu minha nota" → chamar registrar_feedback(tipo="erro", mensagem="Nota fiscal não apareceu no sistema")
    - Usuário: "travou quando tentei adicionar" → chamar registrar_feedback(tipo="erro", mensagem="Sistema travou ao adicionar item")
40. EXEMPLOS PROIBIDOS (NUNCA faça isso):
    - Usuário relata erro → responder "vou anotar" SEM chamar a tool ❌ PROIBIDO
    - Usuário dá sugestão → responder "ótima ideia, vou encaminhar" SEM chamar a tool ❌ PROIBIDO
    - Dizer "registrei sua mensagem", "anotei", "recebemos", "vou repassar" sem tool_call ❌ PROIBIDO
    - Responder com confirmação acolhedora sem ter chamado registrar_feedback ❌ PROIBIDO
41. Somente APÓS a tool registrar_feedback retornar sucesso (campo "sucesso": true), responda ao usuário com confirmação acolhedora. Adapte o tom: empático para erros/reclamações, entusiasta para sugestões, didático para dúvidas. NUNCA confunda feedback sobre o sistema com pedidos de estoque, lista ou compras. "O arroz não baixou do estoque" é feedback de erro. "Baixa o arroz" é comando de estoque.

Regras de Ajuste de Saldo / Inventário (OBRIGATÓRIAS):
42. INTENÇÃO "INFORMAR SALDO ATUAL": Quando o usuário informar o saldo restante no estoque (NÃO compra, entrada ou baixa), use ajustar_saldo_estoque. Frases típicas: "acabou meu X", "não tenho mais X", "agora só tenho X de Y", "só restam X", "tenho X no estoque agora", "sobrou X", "meu X acabou", "restou X".
43. SALDO ZERO: "acabou", "não tenho mais", "meu X acabou", "não restou" = novo_saldo: 0.
44. PROIBIÇÃO ABSOLUTA DE INVENÇÃO: O Picotinho NÃO PODE inventar, completar, deduzir ou inferir por conta própria NENHUM dos seguintes dados: produto, marca, variante, unidade, quantidade, saldo anterior, saldo novo, conversão, produto_id. Se QUALQUER um desses não estiver claro, explícito e seguro, PERGUNTAR antes de executar.
45. PROIBIÇÃO DE INFERIR NÚMEROS: Frases vagas NÃO podem gerar ajuste. Exemplos que NUNCA geram ajuste automático: "tenho um pouco de açúcar", "sobrou banana", "tenho pouca picanha", "resta um restinho", "ainda tenho um pouco". Nesses casos, pedir a quantidade EXATA antes de ajustar.
46. CORRESPONDÊNCIA ÚNICA E SEGURA — "1 match" NÃO basta por si só: Só pode executar diretamente quando houver correspondência única E segura, considerando: nome, contexto, unidade, marca/variante e ausência de risco real de item semelhante. Se houver QUALQUER chance razoável de o item encontrado não ser exatamente o que o usuário quis dizer, PERGUNTAR. Exemplo: busca por "leite" retorna 1 resultado "LEITE INTEGRAL PIRACANJUBA" mas o usuário poderia querer desnatado → PERGUNTAR.
47. BUSCA CONSERVADORA: A busca por nome serve para localizar candidatos, NÃO para autorizar ajuste automático. Similaridade frouxa, aproximação excessiva ou risco de confusão entre itens parecidos OBRIGAM a perguntar.
48. CONVERSÃO AUTOMÁTICA — SOMENTE CASOS CANÔNICOS (lista fechada): g↔kg (1000g = 1kg), ml↔L (1000ml = 1L), meia dúzia → 6 UN. QUALQUER outra conversão (peso↔unidade, volume↔unidade, formatos sem regra explícita do produto) → PERGUNTAR antes de converter.
49. INVENTÁRIO EM LOTE: Quando o usuário listar vários itens com saldo atual ou disser "vou te passar meu estoque" / "quero ajustar meu estoque" / "anota meu inventário":
    a) Extrair todos os itens e saldos
    b) Itens SEM quantidade exata → lista de pendências (NUNCA em ajustados)
    c) Itens com produto ambíguo → lista de ambíguos
    d) Itens com unidade incompatível sem conversão canônica → lista de pendências
    e) Montar resumo SEPARANDO CLARAMENTE: Prontos para ajuste / Ambíguos (precisam de escolha) / Incompletos (falta dado) / Não encontrados / Avisos de unidade
    f) NÃO executar parcialmente antes do fechamento do lote
    g) Pedir confirmação OBRIGATÓRIA do conjunto exato listado no resumo
    h) Só chamar ajustar_saldo_estoque APÓS confirmação explícita ("pode ajustar", "confirmar", "finalizar", "sim")
    i) A execução dispara SOMENTE o conjunto aprovado no resumo — nada pode ser acrescentado, reinterpretado ou recalculado entre o resumo e a execução
50. INVENTÁRIO PARCIAL (PADRÃO): Somente itens mencionados são ajustados. NUNCA zerar itens não mencionados. NUNCA presumir que o usuário listou tudo.
51. DESAMBIGUAÇÃO OBRIGATÓRIA: Se houver múltiplas opções para um item (ex: Picanha Friboi vs Picanha JBS), NUNCA escolher sozinho. Perguntar.
52. DIFERENÇA COM BAIXAR/AUMENTAR: "baixa 2 leites" = remover 2 do saldo atual. "agora só tenho 2 litros de leite" = definir saldo como 2. São intenções DIFERENTES. Não confundir.
53. ITEM ÚNICO SEGURO: Se for 1 item, correspondência única E segura (regra 46), quantidade exata, unidade compatível → pode ajustar diretamente sem pedir confirmação. Se QUALQUER critério falhar → perguntar.
54. NÃO EXECUTAR PARCIALMENTE EM LOTE: Se o usuário está em contexto de inventário em lote, o sistema NÃO sai ajustando silenciosamente parte dos itens. Primeiro consolida tudo, mostra resumo, resolve pendências, só depois executa o lote confirmado.
55. PROIBIÇÃO DE PROMOÇÃO: Item ambíguo, pendente ou com confirmar:true NUNCA pode ser promovido para itens_ajustados na mesma execução. Só após nova resposta explícita do usuário, em chamada subsequente com produto_id resolvido.
56. RASTREABILIDADE: Cada item ajustado inclui o critério que autorizou o ajuste (produto_id_exato, nome_unico_seguro, conversao_canonica) no retorno da tool. Apresente esse dado ao responder.
57. SEGMENTAÇÃO DE MÚLTIPLOS ITENS EM UMA MENSAGEM (CRÍTICO): Quando o usuário informar saldo de vários itens numa única mensagem, você DEVE segmentar CADA item como uma entrada INDEPENDENTE no array de itens da tool ajustar_saldo_estoque. Regras:
    a) Separadores naturais: vírgula, "e", "também", ponto final, quebra de linha
    b) Cada item tem seu próprio nome, quantidade e unidade — ISOLADOS
    c) A quantidade/unidade de um item NUNCA pode contaminar outro item
    d) Itens com "acabou" / "não tenho mais" / "também acabou" = novo_saldo: 0. NÃO envie campo unidade — o servidor herda automaticamente do estoque. Exemplo: { produto_nome: "banana prata", novo_saldo: 0 }
    e) EXEMPLO OBRIGATÓRIO:
       Mensagem: "não tenho mais banana prata, minha couve também acabou e a maçã gala eu tenho só 500 gramas"
       Segmentação CORRETA:
       { itens: [
         { produto_nome: "banana prata", novo_saldo: 0 },
         { produto_nome: "couve", novo_saldo: 0 },
         { produto_nome: "maçã gala", novo_saldo: 0.5, unidade: "KG" }
       ]}
       ATENÇÃO: "500 gramas" = 0.5 KG, NÃO "500 KG". Sempre converter gramas para KG antes de enviar (dividir por 1000).
       ATENÇÃO: Itens com saldo zero NÃO têm campo unidade — o servidor herda do estoque.
    f) "meio quilo" = 0.5 KG. "meia dúzia" = 6 UN. Nunca envie o valor bruto sem converter.
58. VALIDAÇÃO PRÉ-ENVIO DE UNIDADE E QUANTIDADE (CRÍTICO):
    Antes de montar o array de itens para ajustar_saldo_estoque, valide CADA item:
    a) Se o usuário disse "gramas", converta para KG dividindo por 1000 ANTES de enviar
    b) Se o usuário disse "meio quilo", novo_saldo = 0.5 e unidade = KG
    c) Se o usuário disse "500 gramas", novo_saldo = 0.5 e unidade = KG (NÃO 500 KG)
    d) NUNCA envie novo_saldo >= 100 com unidade KG ou L para um único item doméstico sem antes perguntar
    e) REGRA DE PLAUSIBILIDADE: Se o valor parecer absurdo para uso doméstico (ex: 500 KG de maçã, 200 L de leite), NÃO envie — pergunte ao usuário se está correto
    f) Cada item do array deve ser validado ISOLADAMENTE — não misture contexto entre itens
59. BUSCA POR NOME RESUMIDO: O usuário pode falar o produto de forma resumida ou em ordem diferente da cadastrada (ex: "suco de caju", "gelatina de limão", "geléia italianinha"). O servidor localiza por núcleo do nome — envie o nome COMO O USUARIO FALOU, sem completar com marca, peso ou descrição comercial. NÃO invente detalhes que o usuário não disse. O tipo principal do produto (suco, gelatina, xarope, leite etc.) é obrigatório e deve aparecer no nome enviado. Se o usuário falar a marca ou adjetivo antes do tipo (ex: "italianinha geléia"), inclua ambos no nome.
60. PROIBIÇÃO DE ITEM LIVRE EM AJUSTE DE SALDO: Quando a intenção do usuário for informar saldo atual ("acabou", "não tenho mais", "tenho X", "sobrou X"), use EXCLUSIVAMENTE ajustar_saldo_estoque. NUNCA ofereça criar item livre, adicionar produto novo ou desviar para outro fluxo nesse contexto. Se o produto não for encontrado, responda que não encontrou no estoque e pergunte se o nome está correto ou liste candidatos próximos. Criar item livre é um fluxo DIFERENTE que só se aplica quando o usuário pede explicitamente para adicionar um produto novo.
61. ACABOU/ZEROU = ajustar_saldo_estoque com novo_saldo: 0. NÃO usar baixar_estoque (que remove quantidade parcial). "Acabou" define saldo final como zero. NÃO envie campo unidade para saldo zero — o servidor herda automaticamente do estoque.
62. BAIXAR/CONSUMIR ESTOQUE: "usei X de Y", "consumi", "gastei" = baixar_estoque. Envie o nome COMO O USUARIO FALOU, sem exigir nome exato. O servidor usa o mesmo resolvedor por núcleo do ajuste de saldo. Se não encontrar, o servidor retorna candidatos próximos — apresente-os ao usuário em lista numerada limpa e organizada. NÃO peça "nome exato". Para múltiplos itens, envie array em 'itens'. Se um item falhar, os demais seguem. Apresente resultado separado: itens baixados, ambíguos, não encontrados e com problema (ex: saldo insuficiente). Em itens com problema, SEMPRE informe o saldo atual encontrado.
63. UNIDADE NA BAIXA/AUMENTO: Quando o usuário informar a unidade explicitamente (ex: "300 gramas", "2 litros", "500 ml"), ENVIE a unidade no campo 'unidade' da tool (G, KG, L, ML, UN). O servidor faz a conversão para a unidade do estoque automaticamente. NÃO converta gramas para kg antes de enviar — envie o valor e unidade COMO O USUARIO FALOU (ex: 300 G, não 0.3 KG). Se o usuário não mencionar unidade, não envie o campo.
    Exemplo obrigatório para "usei 8 kg de banana prata, 1 couve e 300 gramas de maçã gala":
    { itens: [
      { produto_nome: "banana prata", quantidade: 8, unidade: "KG" },
      { produto_nome: "couve", quantidade: 1, unidade: "UN" },
      { produto_nome: "maçã gala", quantidade: 300, unidade: "G" }
    ]}

Regras de Preferências de Mensagens:
64. O usuário pode gerenciar suas preferências de mensagens proativas pelo WhatsApp. Há 4 tipos: promoções e ofertas, novidades do Picotinho, avisos de estoque, dicas e sugestões úteis.
65. INTERPRETAÇÃO DE COMANDOS:
    - "quero avisos de estoque" / "ativa promoções" → modo: definir, ativa apenas a preferência mencionada (sem alterar as demais)
    - "quero SÓ avisos de estoque" / "quero APENAS dicas" → modo: exclusivo, ativa a mencionada e desativa TODAS as demais
    - "marca tudo" / "ativa tudo" → modo: definir, todas as 4 como true
    - "desmarca tudo" / "desativa tudo" → modo: definir, todas as 4 como false
    - "não quero receber promoções" → modo: definir, pref_promocoes: false
    - "quais mensagens estão ativas?" / "o que eu recebo?" → use consultar_preferencias_mensagens
66. OBRIGATÓRIO: Após QUALQUER alteração de preferências, confirme o estado final COMPLETO das 4 preferências usando ✅ e ❌.
67. O usuário pode atualizar o nome vinculado ao telefone com frases como "esse número é da cozinheira", "coloca o nome desse telefone como Camila". Use atualizar_nome_telefone.

Você pode conversar sobre qualquer assunto brevemente, mas seu foco é ajudar com estoque, compras, listas e organização doméstica.`;


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

    // delayTyping será aplicado no envio da mensagem

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
        
        // === SAFETY NET: Detectar confirmação de feedback sem tool call ===
        const feedbackConfirmKeywords = ['registrei', 'anotei', 'encaminh', 'recebemos sua', 'vou repassar', 
          'feedback registrado', 'sua sugestão', 'seu erro', 'sua reclamação', 'sua dúvida foi', 
          'vou anotar', 'ficou registrado', 'foi anotado', 'nosso time vai'];
        const respLower = finalResponse.toLowerCase();
        const pareceConfirmacaoFeedback = feedbackConfirmKeywords.some(kw => respLower.includes(kw));
        if (pareceConfirmacaoFeedback) {
          console.warn(`⚠️ [FEEDBACK-SAFETY] IA respondeu confirmando feedback SEM chamar registrar_feedback! Resposta: "${finalResponse.substring(0, 200)}"`);
        }
        
        // === SAFETY NET 2: Detectar mensagem do usuário com forte intenção de feedback sem tool call ===
        const userFeedbackKeywords = ['bug', 'erro no sistema', 'não funcionou', 'não apareceu', 'travou', 
          'deu problema', 'não consegui', 'quero reportar', 'quero reclamar', 'tenho uma sugestão', 
          'seria melhor se', 'poderia ter', 'não tá funcionando', 'deu erro', 'não carregou', 
          'não atualizou', 'sumiu', 'achei um erro', 'problema no sistema', 'o sistema não'];
        const userMsgLower = conteudo.toLowerCase();
        const pareceUsuarioFeedback = userFeedbackKeywords.some(kw => userMsgLower.includes(kw));
        if (pareceUsuarioFeedback) {
          console.warn(`⚠️ [FEEDBACK-SAFETY-INPUT] Mensagem do usuário parece feedback sobre o sistema mas IA NÃO chamou registrar_feedback! Msg: "${conteudo.substring(0, 200)}"`);
        }
        
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
        
        // Injetar remetente para tools de preferências que precisam identificar o telefone
        if (['gerenciar_preferencias_mensagens', 'atualizar_nome_telefone'].includes(toolName)) {
          toolArgs._remetente = remetente;
        }
        
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

          // Caso 4: ajustar_saldo_estoque retornou itens_ambiguos com opções
          if (toolName === 'ajustar_saldo_estoque' && parsedResult.itens_ambiguos) {
            for (const ambiguo of parsedResult.itens_ambiguos) {
              if (ambiguo.opcoes && ambiguo.opcoes.length > 1) {
                opcoesParaSalvar = ambiguo.opcoes.map((o: any, i: number) => ({
                  numero: i + 1,
                  produto_id: o.id,
                  nome: o.nome_completo || o.nome_consolidado || 'Sem nome'
                }));
                contextoSnapshot = 'ajustar_saldo_estoque';
                break;
              }
            }
          }

          // Caso 5: baixar_estoque retornou itens_ambiguos com opções
          if (toolName === 'baixar_estoque' && parsedResult.itens_ambiguos) {
            for (const ambiguo of parsedResult.itens_ambiguos) {
              if (ambiguo.opcoes && ambiguo.opcoes.length > 1) {
                opcoesParaSalvar = ambiguo.opcoes.map((o: any, i: number) => ({
                  numero: i + 1,
                  produto_id: o.id,
                  nome: o.nome || 'Sem nome'
                }));
                contextoSnapshot = 'baixar_estoque';
                // Salvar contexto extra para reexecução
                (opcoesParaSalvar as any).quantidade_pendente = ambiguo.quantidade_pedida;
                (opcoesParaSalvar as any).unidade_pendente = ambiguo.unidade_pedida;
                break;
              }
            }
          }

          // Caso 6: aumentar_estoque retornou itens_ambiguos com opções
          if (toolName === 'aumentar_estoque' && parsedResult.itens_ambiguos) {
            for (const ambiguo of parsedResult.itens_ambiguos) {
              if (ambiguo.opcoes && ambiguo.opcoes.length > 1) {
                opcoesParaSalvar = ambiguo.opcoes.map((o: any, i: number) => ({
                  numero: i + 1,
                  produto_id: o.id,
                  nome: o.nome || 'Sem nome'
                }));
                contextoSnapshot = 'aumentar_estoque';
                (opcoesParaSalvar as any).quantidade_pendente = ambiguo.quantidade_pedida;
                (opcoesParaSalvar as any).unidade_pendente = ambiguo.unidade_pedida;
                break;
              }
            }
          }

          if (opcoesParaSalvar && opcoesParaSalvar.length > 0) {
            const extraData = opcoesParaSalvar as any;
            const snapshot: any = {
              timestamp: new Date().toISOString(),
              contexto: contextoSnapshot,
              lista_id: listaIdSnapshot,
              opcoes: opcoesParaSalvar
            };
            // Preservar dados extras para reexecução
            if (extraData.quantidade_pendente !== undefined) snapshot.quantidade_pendente = extraData.quantidade_pendente;
            if (extraData.unidade_pendente !== undefined) snapshot.unidade_pendente = extraData.unidade_pendente;
            await supabase.from('whatsapp_preferencias_usuario').update({ opcoes_pendentes: snapshot }).eq('usuario_id', usuarioId);
            console.log(`📸 [SNAPSHOT] Salvas ${opcoesParaSalvar.length} opções pendentes para o usuário (tool: ${toolName}, contexto: ${contextoSnapshot})`);
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

    // 7. Send response via WhatsApp (respecting modo_resposta)
    if (finalResponse) {
      if (finalResponse.length > 4000) {
        finalResponse = finalResponse.substring(0, 3950) + "\n\n... (mensagem truncada)";
      }

      // Enviar texto se modo é 'texto' ou 'ambos'
      if (modoResposta === 'texto' || modoResposta === 'ambos') {
        await sendWhatsAppMessage(remetente, finalResponse, DELAY_TYPING.RESPOSTA_PRINCIPAL);
      }

      // Enviar áudio se modo é 'audio' ou 'ambos'
      if (modoResposta === 'audio' || modoResposta === 'ambos') {
        try {
          // delayTyping não se aplica a áudio
          const audioBase64 = await generateTTS(finalResponse);
          if (audioBase64) {
            await sendWhatsAppAudio(remetente, audioBase64);
          } else if (modoResposta === 'audio') {
            // Fallback: se TTS falhar e modo é só áudio, enviar texto
            await sendWhatsAppMessage(remetente, finalResponse, DELAY_TYPING.FALLBACK);
            console.log('⚠️ TTS falhou, fallback para texto');
          }
        } catch (err) {
          console.error('❌ Erro TTS:', err);
          if (modoResposta === 'audio') {
            await sendWhatsAppMessage(remetente, finalResponse, DELAY_TYPING.FALLBACK);
          }
        }
      }
      
      await supabase.from('whatsapp_mensagens').update({
        resposta_enviada: finalResponse, processada: true,
        data_processamento: new Date().toISOString(), comando_identificado: 'assistente_ia'
      }).eq('id', messageId);

      // presença removida — delayTyping cuida do indicador visual
      console.log(`✅ [ASSISTANT] Resposta enviada (modo: ${modoResposta}) e persistida (${finalResponse.length} chars)`);
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
