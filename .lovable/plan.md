

## Consolidação de itens duplicados na lista de compras

### Problema
Ao adicionar um produto que já existe na lista (mesmo `produto_id`), o sistema cria uma nova linha em vez de somar a quantidade ao item existente. Isso polui a lista com duplicatas.

### Solução
Transformar o insert em lógica de upsert: antes de inserir cada item, verificar se já existe na mesma lista um item com o mesmo `produto_id`. Se existir, atualizar a quantidade somando. Se não, inserir normalmente.

### Arquivo: `supabase/functions/picotinho-assistant/index.ts`

**Mudança única — substituir o bloco de insert em massa (linhas 661-667) por lógica de upsert individual:**

Para cada item em `itensParaInserir`:

1. Se o item tem `produto_id` (não é item livre):
   - Buscar em `listas_compras_itens` um registro com `lista_id` = item.lista_id **e** `produto_id` = item.produto_id
   - **Se encontrar**: atualizar quantidade = quantidade existente + nova quantidade. Log: `📦 [upsert] ${nome} | consolidado: +${qtd} → total ${novaQtd}`
   - **Se não encontrar**: inserir normalmente

2. Se o item é `item_livre` (sem `produto_id`):
   - Buscar por `lista_id` + `produto_nome` (case-insensitive) + `item_livre = true`
   - **Se encontrar**: consolidar quantidade
   - **Se não encontrar**: inserir normalmente

O retorno da tool indicará quais itens foram consolidados vs inseridos como novos.

### Resultado esperado

| Situação | Antes | Depois |
|---|---|---|
| Maçã Gala (2) já na lista, usuário pede +3 | 2 linhas: Maçã Gala (2) + Maçã Gala (3) | 1 linha: Maçã Gala (5) |
| Produto novo | Nova linha | Nova linha (sem mudança) |
| Item livre "biscoito" já na lista, pede +1 | 2 linhas duplicadas | 1 linha consolidada |

### Detalhes técnicos

A lógica de upsert será aplicada no loop que hoje apenas acumula em `itensParaInserir[]`. Em vez de acumular e fazer um `.insert()` em massa no final, cada item será processado individualmente com verificação de existência prévia. Itens consolidados serão rastreados separadamente no retorno (`itens_consolidados` com nome, quantidade anterior e nova).

