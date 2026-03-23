

## Correção: Renderizar itens sem preço na lista principal

### O que será feito

**Arquivo: `src/pages/ListaCompras.tsx`**

Após os grupos de mercado (dentro do bloco `tabAtiva === 'otimizado'` e também no bloco `tabAtiva !== 'otimizado'`), adicionar uma seção que renderiza os itens de `produtosSemPreco`:

- Título da seção: "Produtos sem preço nos mercados próximos"
- Cada item renderizado com:
  - Checkbox para marcar como comprado
  - Nome do produto
  - Controles de quantidade (+/-)
  - Badge discreto: "Sem preço disponível"
  - **Sem exibir preço zero** — a área de preço simplesmente não aparece

**Componente: `src/components/listaCompras/ItemProdutoSemPreco.tsx`** (novo)

Componente simplificado baseado no `ItemProduto`, mas sem a seção de preço/economia. Aceita os mesmos handlers `onToggleComprado` e `onQuantidadeChange`.

### O que NÃO muda

- Edge function `comparar-precos-lista` — sem alteração
- Componentes existentes (`ItemProduto`, `GrupoMercado`, `EditarListaDialog`)
- Estrutura do banco de dados
- Lógica de preços dos itens que já funcionam

### Resultado

Todo item da lista será visível na tela principal, com ou sem preço. Quando um item ganhar preço (nova nota fiscal), ele automaticamente migra para os grupos de mercado na próxima atualização.

