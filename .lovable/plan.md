

## Picotinho WhatsApp — Fase 2: Plano Final com Nomenclatura Padronizada

Todas as tools de lista agora carregam sufixo `_lista` explicito, eliminando qualquer ambiguidade com operacoes de estoque.

---

### Nomenclatura padronizada das tools

| Tool (nome final) | Tipo | Descricao curta |
|---|---|---|
| `listar_listas` | leitura | Retorna listas do usuario com contagem de itens |
| `buscar_lista_por_nome` | leitura | Busca listas por termo, desambigua se >1 match |
| `criar_lista` | mutacao | Cria lista nova, define como ativa |
| `definir_lista_ativa` | metadata | Atualiza lista ativa nas preferencias |
| `listar_itens_lista` | leitura | Retorna itens de uma lista especifica ou da ativa |
| `adicionar_itens_lista` | mutacao | Adiciona array de itens a uma lista |
| `remover_item_lista` | mutacao | Remove item de uma lista |
| `alterar_quantidade_item_lista` | mutacao | Altera quantidade de item em uma lista |
| `resolver_item_por_historico` | leitura | Busca produto habitual do usuario em notas |
| `calcular_valor_lista` | leitura | Estima valor otimizado da lista |

**Mudancas em relacao ao plano anterior:**
- `alterar_quantidade_item` → `alterar_quantidade_item_lista` (clareza: operacao sobre lista, nao estoque)
- `adicionar_item_lista` → `adicionar_itens_lista` (plural, reflete que aceita array)

Tools de estoque da Fase 1 permanecem intactas: `baixar_estoque`, `aumentar_estoque`, `adicionar_produto`, `buscar_estoque`, `itens_acabando`, `buscar_produtos_similares`.

---

### Resto do plano — sem alteracoes

Tudo o mais permanece identico ao plano aprovado anteriormente:

- **Migration**: ADD COLUMN `lista_ativa_id` em `whatsapp_preferencias_usuario`
- **Arquivo editado**: apenas `supabase/functions/picotinho-assistant/index.ts`
- **10 tools** com a nomenclatura acima
- **Regras 11-21** no system prompt (incluindo bloqueio de exclusao de lista)
- **Contador** `writeMutationsExecuted` cobrindo estoque + lista
- **`definir_lista_ativa`** e metadata, nao conta como mutacao
- **`adicionar_itens_lista`** aceita array, conta como 1 mutacao
- **Seguranca**: todas as queries filtram por `user_id = usuarioId`

