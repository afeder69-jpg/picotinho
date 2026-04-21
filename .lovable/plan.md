

# Plano revisado e enxuto: nomes em CAIXA ALTA na Lista de Compras

## Componentes realmente usados na renderização da Lista de Compras

Confirmado por inspeção dos imports em `ListaCompras.tsx` e `ListaComprasComprar.tsx`:

| Componente | Onde é usado | Exibe `produto_nome`? |
|---|---|---|
| `ItemProdutoLista.tsx` | `ListaCompras.tsx` (lista principal) | ✅ |
| `ItemProdutoSemPreco.tsx` | `ListaCompras.tsx` (sem preço / livres) | ✅ |
| `ItemProduto.tsx` | `GrupoMercado.tsx` (modo comparação por mercado) | ✅ |
| `ItemProdutoInterativo.tsx` | `ListaComprasComprar.tsx` (modo comprar) | ✅ |

## Arquivos que serão alterados (mínimo necessário)

### Camada 1 — Exibição (4 arquivos, 1 linha cada)

Alteração trivial: `{item.produto_nome}` → `{(item.produto_nome ?? '').toUpperCase()}`.

1. `src/components/listaCompras/ItemProdutoLista.tsx` (linha 40)
2. `src/components/listaCompras/ItemProdutoSemPreco.tsx` (linha 45)
3. `src/components/listaCompras/ItemProduto.tsx` (linha ~58)
4. `src/components/listaCompras/ItemProdutoInterativo.tsx` (linha 39)

Esses 4 cobrem 100% do que o usuário vê na tela de Lista de Compras (incluindo a "Itens para comprar").

### Camada 2 — Entrada (2 arquivos, ajuste mínimo)

5. `src/pages/EstoqueAtual.tsx` (linha 1525) — único ponto que insere na lista automática "Itens para comprar":
   ```ts
   produto_nome: (item.produto_nome_exibicao || item.produto_nome || 'Produto').toUpperCase().trim()
   ```

6. `src/components/listaCompras/EditarListaDialog.tsx` (linha 156) — único ponto de inserção de **item livre** digitado manualmente:
   ```ts
   produto_nome: texto.toUpperCase().trim()
   ```

   Obs.: a renderização do nome do produto **dentro do EditarListaDialog** (linha 360) **não será alterada** — é uma lista de seleção de produtos master, que já vêm em CAIXA ALTA do catálogo. Manter conservador.

## Arquivos que ficam de fora (justificativa)

| Arquivo do plano anterior | Por que NÃO alterar agora |
|---|---|
| `ExportarListaDialog.tsx` | É exportação PDF/texto, fluxo secundário. Não é a tela de Lista de Compras. Se o usuário quiser depois, tratamos isolado. |
| `TabelaComparativa.tsx` | Comparação cruzada entre mercados, fluxo secundário. A correção de exibição em `ItemProduto` já cobre o GrupoMercado. |
| Linha 360 do `EditarListaDialog.tsx` (renderização) | Lista produtos master que já são ALL CAPS pelo padrão do catálogo. Mexer seria redundante e aumenta risco. |
| `AdicionarListaDialog.tsx` | Insere via `produto.nome_padrao` (master, já ALL CAPS). Sem necessidade. |

## Total de arquivos alterados

**6 arquivos**, todos com mudança de 1 linha (ou expressão):
- 4 componentes de exibição (toUpperCase no render)
- 2 pontos de entrada (toUpperCase no insert)

## O que NÃO é tocado

- Lógica de preços, comparação, swipe, undo, exclusão, edição de quantidade, realtime, lazy loading.
- Estoque, catálogo master, normalização, notas fiscais.
- Banco: nenhum migration, nenhum backfill.
- Buscas e dedup (já são case-insensitive nos pontos relevantes).

## Resultado garantido

| Cenário | Resultado |
|---|---|
| Itens antigos em minúsculo na lista "Itens para comprar" | Aparecem em MAIÚSCULO (Camada 1) |
| Novo item via carrinho do estoque | Salvo e exibido em MAIÚSCULO (Camadas 1+2) |
| Item livre digitado manualmente | Salvo e exibido em MAIÚSCULO (Camadas 1+2) |
| Item via produto master | Já era MAIÚSCULO, continua igual |
| Modo "Comprar" e modo "Por mercado" | Exibem em MAIÚSCULO |

## Validação

1. Abrir lista "Itens para comprar" com itens antigos → todos em CAIXA ALTA.
2. Zerar produto no estoque + carrinho → item entra em MAIÚSCULO no banco e na tela.
3. Adicionar item livre via "Editar Lista" digitando minúsculo → salvo e exibido em MAIÚSCULO.
4. Modo Comprar e GrupoMercado → nomes em MAIÚSCULO.
5. Swipe, comprado, editar quantidade, comparação de preços, undo → comportamento inalterado.

