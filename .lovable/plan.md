

## Itens livres na lista de compras

### Conceito

Permitir que o usuário digite texto livre para adicionar itens que nao existem no catalogo master. Esses itens convivem na mesma lista, mas sao visualmente diferenciados.

### Abordagem: usar a tabela existente `listas_compras_itens`

A tabela `listas_compras_itens` ja suporta `produto_id` nullable. A distinção entre item do catalogo e item livre sera:

- **Item do catalogo**: `produto_id` preenchido
- **Item livre**: `produto_id = null` + `produto_nome` contendo o texto digitado pelo usuario

Nao e necessaria nenhuma alteracao de schema. A tabela ja comporta isso.

### Alterações

**1. `CriarListaDialog.tsx`** — Adicionar campo de texto livre abaixo do seletor de produtos

- Input de texto + botao "Adicionar" para itens livres
- Quantidade padrao 1, unidade "UN"
- Itens livres aparecem na lista com badge "Item livre" para diferenciar dos produtos do catalogo
- Validacao: texto nao vazio, maximo 200 caracteres

**2. `EditarListaDialog.tsx`** — Mesmo campo de texto livre para adicionar itens ao editar

- Adicionar input de texto livre abaixo do `SeletorProdutoNormalizado`
- Inserir diretamente em `listas_compras_itens` com `produto_id: null`
- Badge visual "Item livre" nos itens sem `produto_id`

**3. `gerar-lista-otimizada/index.ts`** — Ajustar para aceitar itens sem `produto_id`

- Na secao `origem === 'manual'`, itens que ja vem com `produto_id: null` nao passam pela resolucao de master (skip do `ilike`)
- Preserva comportamento atual para itens com nome de produto master

**4. `ItemProdutoSemPreco.tsx`** — Diferenciar visualmente item livre de produto sem preco

- Se `produto_id` for null: badge "Item livre" (azul/neutro) em vez de "Sem preco disponivel"
- Se `produto_id` existir mas sem preco: manter badge atual "Sem preco disponivel"

**5. `ListaCompras.tsx`** — Separar itens livres na exibicao

- Itens livres (`produto_id === null` e nao presentes na comparacao) aparecem em secao propria "Lembretes / Itens livres" abaixo dos produtos sem preco
- Checkbox de comprado funciona normalmente
- Quantidade editavel normalmente

### Fluxo do usuario

1. Ao criar ou editar lista, alem de buscar no catalogo, pode digitar texto livre
2. Texto livre e salvo como item da lista com `produto_id: null`
3. Na visualizacao, itens livres aparecem em secao separada com badge distinto
4. Na comparacao de precos, itens livres sao ignorados (nao tem master para comparar)
5. No modo comprar, itens livres aparecem como checklist simples

### O que NAO muda

- Fluxo de produtos do catalogo master permanece identico
- Comparacao de precos nao e afetada
- Tabela comparativa nao inclui itens livres
- Nenhuma migração de banco necessaria

