

# Fase 1.1 — Histórico mais robusto + pendentes integrados ao agrupamento por mercado

## Causa raiz confirmada (lista `3c75022d…` do usuário `ae5b5501…`)

| Item | `produto_id` na lista | Existe no estoque do usuário? | Por que o histórico não aparece hoje |
|---|---|---|---|
| MACARRÃO FETUCCINE SANTA AMÁLIA 500G | `9e39dcb9` | Sim, mas com master `622113f0` (variante "SÊMOLA") e nome levemente diferente | `buscarUltimoPrecoConhecido` consulta `precos_atuais` por master `9e39dcb9` (sem registros) e `estoque_app` por `ilike(nome exato)` — não casa o nome com "SÊMOLA" |
| ISOTÔNICO POWER 500ML | `7174e12e` | Sim, mesmo master. Tem `precos_atuais` em CNPJ PREZUNIC | PREZUNIC não está na área de atuação. `precos_atuais` retorna ele como histórico, mas o item ainda foi para "Sem preço" e o usuário quer ver dentro de PREZUNIC |
| PAPEL HIGIÊNICO DELUXE COTTON FOLD 30M 24 UN | `2c26d9f4` | Sim, com master `eae43acf` (mesmo produto, master duplicado "COTT N FD") | Master diferente; busca por nome exato falha por causa de "COTT N FD" vs "COTTON FOLD" |
| ESPONJA DE AÇO BOMBRIL 45G | `c7592206` | Não exatamente — usuário tem "ESPONJA MULTIUSO BOMBRIL 4 UN" e "ESPONJA BOMBRIL LV4P3" | Produtos diferentes; histórico legítimo só existe para variantes |

## Duas correções, ambas cirúrgicas

### Correção A — Backend: histórico por **token-cover**, não por igualdade

`supabase/functions/comparar-precos-lista/index.ts` → `buscarUltimoPrecoConhecido`

Manter as 3 fontes (precos_atuais por master / estoque_app do usuário / notas_imagens JSONB) mas trocar o critério de match nas fontes 2 e 3:

1. Tokenizar o nome do item: UPPER + remover acentos + remover pontuação + dividir por espaço + descartar tokens ≤2 caracteres e tokens puramente numéricos sem unidade.
2. Calcular cobertura: `score = tokens_do_item ∩ tokens_do_candidato`. Aceitar se cobertura ≥ 80% dos tokens do item OU se ≥ 3 tokens fortes baterem (incluindo a marca).
3. Para fonte 2 (`estoque_app`), trocar `ilike(nome_exato)` por `select` filtrado por `user_id` + `not preco_unitario_ultimo is null`, ordenar por `updated_at desc`, **pegar últimos 50** e filtrar em memória aplicando o token-cover. Devolve o de maior score (em empate, mais recente).
4. Para fonte 3 (`notas_imagens` JSONB), fazer o mesmo: já lê 50 notas; em vez de `===`, aplicar token-cover sobre `descricao`/`nome` de cada produto da nota.
5. **Salvaguarda anti-falso-positivo**: se o item tem token de variante (ex: "SÊMOLA", "ZERO", "INTEGRAL", "DIET", "LIGHT", "DE AÇO", "MULTIUSO") e esse token não bate, rejeita o candidato. Reaproveita a lista de variantes da memória `product-variant-keyword-validation`. Resultado: para o usuário, "ESPONJA DE AÇO BOMBRIL 45G" continua sem histórico (não é a esponja multiuso), mas "MACARRÃO FETUCCINE SANTA AMÁLIA 500G" passa a casar com "MACARRÃO FETUCCINE SÊMOLA SANTA AMÁLIA 500G" se você decidir tratar SÊMOLA como token neutro — vamos manter SÊMOLA como **neutro** para tipo de massa de mesma família e adicionar uma whitelist curta de tokens neutros (`SÊMOLA`, `TRADICIONAL`, `CLÁSSICO`).

Resultado esperado dos 4 itens problemáticos:
- Macarrão Fetuccine: passa a recuperar o último preço (R$ 5,20) com o estabelecimento da nota.
- Papel Higiênico Deluxe: recupera R$ 29,98.
- Isotônico Power: recupera o último preço local do usuário (estoque) ou o `precos_atuais` PREZUNIC.
- Esponja de Aço Bombril 45g: continua sem histórico (correto — produto diferente).

### Correção B — Backend + Frontend: pendentes/sem-preço com histórico **entram no mercado**

Ajustar a saída de `comparar-precos-lista` para que itens com histórico (`ultimo_preco != null`) sejam injetados no agrupamento do mercado correspondente, em vez de irem para `produtosSemPreco`.

**Backend**:
- Após calcular `produtosSemPreco`, para cada item com `ultimo_preco.estabelecimento_nome` preenchido:
  1. Tentar casar esse nome de estabelecimento com algum mercado da área (normalização UPPER+trim+sem-acento; usar `normalizacoes_estabelecimentos` quando disponível).
  2. Se casou: injetar o item no `mercadosOtimizado` correspondente (cria a entrada se não existir) e em `comparacao[mercadoX].produtos`, marcando `aguardando_normalizacao: true` e `historico: true`. Atualizar `mercado.total` somando `ultimo_preco.valor * quantidade`. **Não** entra em `melhor_preco` nem em `economia` (não vai para comparação cruzada).
  3. Se NÃO casou (mercado fora da área ou desconhecido): cria/usa um grupo especial `mercadoHistorico_<cnpj-ou-nome>` em `comparacao` (não na otimizada) ou mantém em `produtosSemPreco` apenas como último recurso.
- Itens sem `ultimo_preco` continuam em `produtosSemPreco`.

**Frontend** (`src/pages/ListaCompras.tsx` + `GrupoMercado.tsx` + `ItemProduto.tsx`):
- `GrupoMercado` continua igual; `ItemProduto` recebe novas props opcionais `aguardandoNormalizacao` e `historico`. Quando ambas verdadeiras, exibe um badge discreto "Aguardando normalização" e uma marca visual sutil (ex: bolinha vermelha pequena ao lado do preço) indicando "preço histórico". Sem mudar layout, sem afetar swipe/checkbox/quantidade.
- `ListaCompras.tsx` não precisa de filtro novo — o backend já entrega esses itens dentro de `dadosAtivos.mercados[].produtos`. A seção "📋 Produtos sem preço" só renderiza o que sobrar (pendentes sem nenhum histórico recuperável).
- `CardResumoOtimizado` e a soma do mercado naturalmente já incluem esses itens porque vêm dentro de `mercado.produtos` e `mercado.total` já considera o valor.

### Comparação cruzada protegida

A `TabelaComparativa` e o cálculo de `melhor_preco`/`economia` continuam usando apenas itens com preço **atual** (resultado de `buscarPrecoInteligente`). Os injetados via histórico ficam marcados com `historico: true` e são ignorados nesses cálculos:

- Em `comparacao[mercadoX].produtos`: o item histórico aparece com `melhor_preco: false`, `economia: 0`, `historico: true`. A `TabelaComparativa` filtra `historico !== true` ao montar a comparação cruzada.
- Em `mercadosOtimizado`: o item histórico não disputa "melhor preço entre mercados". É exibido no mercado de origem porque o preço é real, mas não conta como vencedor.

## Arquivos alterados (3)

1. `supabase/functions/comparar-precos-lista/index.ts`
   - Reescrever `buscarUltimoPrecoConhecido` com token-cover + lock de variante + whitelist de neutros.
   - Após o loop, redistribuir os itens com `ultimo_preco` para o mercado correspondente em `mercadosOtimizado` e `comparacao`, marcando `historico: true` e `aguardando_normalizacao: true`. Pendentes sem histórico permanecem em `produtosSemPreco`.

2. `src/components/listaCompras/ItemProduto.tsx`
   - Aceitar e renderizar `aguardando_normalizacao` (badge "Aguardando normalização", discreto, abaixo do nome) e `historico` (bolinha vermelha pequena ao lado do preço).

3. `src/components/listaCompras/TabelaComparativa.tsx`
   - Ao montar o cruzamento entre mercados, ignorar produtos com `historico: true`.

Sem mudança em `ListaCompras.tsx`, `GrupoMercado.tsx`, `EstoqueAtual.tsx`, `ItemProdutoSemPreco.tsx` (este último continua existindo só para o resíduo). Sem migration, sem trigger, sem backfill.

## O que NÃO é tocado

- Lógica de área de atuação, busca de mercados próximos, raio.
- Cálculo de `precos_atuais` por mercado para itens normalizados.
- Swipe, undo, lazy loading, edição de quantidade, marcar comprado, exclusão, realtime.
- Itens livres manuais (`item_livre = true`) continuam em "💬 Lembretes".
- Fase 2 (reconciliação global pós-normalização) — segue separada.

## Validação

1. Lista `3c75022d…`: Macarrão Fetuccine, Papel Higiênico Deluxe, Isotônico Power passam a aparecer **dentro do mercado de origem** (PREZUNIC ou supermercado da última nota) com preço, data e badge "Aguardando normalização". Compõem o total daquele mercado.
2. Esponja de Aço Bombril 45g (variante real diferente): permanece em "📋 Produtos sem preço" sem valor — comportamento correto.
3. `TabelaComparativa`: itens históricos não aparecem como "vencedor" em outros mercados; só ficam visíveis no mercado de origem.
4. Itens normalizados com preço atual na área: comportamento idêntico ao de hoje.
5. Itens livres manuais: permanecem em "💬 Lembretes".
6. Swipe, undo, comprado, edição de quantidade, lazy loading: inalterados.
7. Comparação cruzada não vaza pendentes ainda não normalizados (proteção da Fase 1 mantida via flag `historico`).

