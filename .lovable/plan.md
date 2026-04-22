

# Hotfix — Restaurar tela de preços (tela branca após "Preços")

## Causa raiz (confirmada por leitura do código)

O backend cria grupos em `comparacao.mercadosHistorico` com `distancia: null` (linha 974 de `comparar-precos-lista/index.ts`). O frontend, ao renderizar esses grupos com `<GrupoMercado />`, executa `mercado.distancia.toFixed(1)` em `GrupoMercado.tsx` linha 34. Como `distancia` é `null`, isso lança `TypeError: Cannot read properties of null (reading 'toFixed')` durante a renderização. Sem error boundary acima, a árvore React inteira é desmontada → **tela branca**.

Há dois locais idênticos com o mesmo bug latente:
- `GrupoMercado.tsx` linha 34 — chamado nos blocos novos da tab "otimizado" (linha 494) e "mercado" (linha 606) de `ListaCompras.tsx`.
- `CardResumoOtimizado.tsx` linha 74 — não recebe `mercadosHistorico` hoje, mas a mesma fragilidade existe.

Não é problema de timeout, payload extra, nem de `ItemProduto` (já trata `historico/aguardando_normalizacao` corretamente). É apenas o `distancia` nulo.

## Correção mínima (2 arquivos, surgical)

### 1. `src/components/listaCompras/GrupoMercado.tsx`
- Tornar `distancia` opcional na interface (`distancia?: number | null`).
- Renderizar a linha de metadados com guarda: se `distancia` for número, mostrar `X.X km • N produtos`; se for `null/undefined` (caso histórico fora da área), mostrar apenas `Histórico fiscal • N produtos` (ou só `N produtos`).
- Nenhuma outra mudança visual.

### 2. `src/components/listaCompras/CardResumoOtimizado.tsx`
- Aplicar a mesma guarda em `mercado.distancia.toFixed(1)` (linha 74) e em `dados.distancia?.toFixed(1)` (já é opcional, mas confirmar). Se `distancia` for nula, omitir o ` • X.X km`.

## O que NÃO muda

- Backend `comparar-precos-lista` permanece como está; `mercadosHistorico` continua com `distancia: null`. Isso é semanticamente correto (mercado fora da área não tem distância calculável).
- `ItemProduto`, `TabelaComparativa`, lazy loading, swipe, undo, realtime, comparação cruzada: inalterados.
- Lógica de busca histórica por tokens, lock de variante, master irmão, redistribuição: inalterada.

## Validação

1. Clicar em "Preços" na lista `3c75022d…` não deve mais gerar tela branca.
2. Mercados normais (com `distancia` numérica) seguem mostrando `X.X km • N produtos`.
3. Grupos em "Histórico fiscal por mercado" renderizam sem distância (apenas contagem de produtos), com os itens dentro mostrando badge "Aguardando normalização".
4. `produtosSemPreco` continua mostrando só itens sem nenhum histórico recuperável.
5. Tabs, totais, comparação e exportação continuam funcionando.

