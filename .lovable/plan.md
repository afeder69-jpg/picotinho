

# Fase 1.2 — Diagnóstico final + correções cirúrgicas

## Diagnóstico real (com base no banco)

Os 4 itens problemáticos da lista de teste do usuário **não são pendentes** — todos têm `produto_master_id` preenchido. O que acontece:

| Item lista | Master da lista | Master do estoque do usuário | Causa |
|---|---|---|---|
| ISOTÔNICO POWER 500ML | `7174e12e-3b67…` | `7174e12e-f487…` (duplicado) | Master da lista está sem registros em `precos_atuais`. Histórico **é encontrado** via `estoque_app` e exibido, mas a redistribuição para mercado **não acontece** |
| MACARRÃO FETUCCINE SANTA AMÁLIA 500G | `9e39dcb9…` (sem SÊMOLA) | `622113f0…` (com SÊMOLA) | Mesmo padrão, mas o token-cover deveria casar (SÊMOLA é neutro) |
| PAPEL HIGIÊNICO DELUXE COTTON FOLD 30M 24 UN | `2c26d9f4…` (COTTON FOLD) | `eae43acf…` (COTT N FD) | Mesmo padrão, deveria casar (5 tokens em comum) |
| ARROZ COPARROZ PARBOILIZADO T1 5KG | `568976d1…` (COPARROZ) | `b97ccfaa…` (CAMIL) | **Produtos realmente diferentes** (marcas distintas). Não casar é o comportamento correto |

A causa central é **dupla**: (a) mesmo quando o histórico é encontrado, vários itens não estão sendo **redistribuídos** para dentro do mercado, e (b) parte dos itens nem chega no fallback de histórico porque trafegam pelo caminho de "tem master, mas mercado não tem preço" e seu master é duplicata órfã.

## Correções (3 arquivos, surgicais)

### Correção 1 — Master órfão da lista deve cair no histórico via estoque

`supabase/functions/comparar-precos-lista/index.ts` → função `buscarUltimoPrecoConhecido`

Quando o item tem `produto_master_id` mas a tabela `precos_atuais` não tem nenhum registro para esse master (caso de master duplicado da lista), a função hoje retorna `null` e nem tenta o estoque. Corrigir:

- A consulta a `precos_atuais` por `masterId` (linha 491) só dispara se houver registros. Se não houver, **continuar para o passo 2 (estoque do usuário por token-cover)** em vez de aceitar o resultado vazio. Isso já é o comportamento correto do código (`if (data?.valor_unitario)` segue para o passo 2 quando não acha), então confirmar o fluxo e adicionar log explícito `[HIST] Master sem precos_atuais — caindo para estoque do usuário`.
- **Adicionar Passo 1.5**: se o item tem `produto_master_id`, tentar achar **o master "irmão"** no estoque do usuário (case: master da lista é `7174e12e-3b67…`, master do estoque é `7174e12e-f487…`). Buscar `estoque_app` do usuário por `produto_nome` com token-cover + lock de variante; se achar com `produto_master_id` distinto e não-nulo, usar esse master para uma segunda tentativa em `precos_atuais` (mesmas regras do Passo 1). Isso resolve casos de master duplicado sem precisar consolidar agora.

### Correção 2 — Redistribuição pra mercado: cobrir mais cenários de match de estabelecimento

`supabase/functions/comparar-precos-lista/index.ts` → função `matchEstabelecimentoComMercado`

Hoje o match faz CNPJ exato + nome com `includes` bidirecional. Está **correto para PREZUNIC** (CNPJ bate). Adicionar duas defesas:

1. Antes de declarar "sem mercado", também consultar `normalizacoes_estabelecimentos` por `nome_original` ou `nome_normalizado` casando com `estNome` para resolver casos onde a nota traz "PREZUNIC BARRA" mas o supermercado da área foi cadastrado com a razão social "CENCOSUD BRASIL". Se achar o registro normalizado, usar o `cnpj` dele para buscar em `mercados`.
2. Loggar com clareza quando o match falha: `[REDIST-FALHOU] item=X, estab=Y, cnpj=Z — mercado não está na área` para ficar fácil de diagnosticar.

### Correção 3 — Item injetado no mercado precisa de `unidade_medida` correta

`supabase/functions/comparar-precos-lista/index.ts` → bloco de injeção (linhas 784-797)

O `produtoInjetado` já carrega `unidade_medida: itemSP.unidade_medida` — confirmar que sobreviveu na propagação do `itemSP` (vem do spread `...item` no push original em produtosSemPreco linha 659). **Sem mudança extra além de validar.**

### Correção 4 — Frontend: garantir que `ItemProduto` exibe pendentes injetados igual aos demais

`src/components/listaCompras/ItemProduto.tsx` já recebe `historico` e `aguardando_normalizacao` (Fase 1.1). Não muda. Validar apenas que `ListaCompras.tsx` passa essas flags ao percorrer `mercado.produtos` (já passa via spread).

## Salvaguardas que NÃO mudam

- Comparação cruzada entre mercados continua filtrando `historico !== true`.
- Itens livres manuais permanecem em "💬 Lembretes".
- Pendente real (sem master nenhum) continua bloqueado da comparação cruzada.
- Lock de variante e whitelist de neutros mantidos.
- Sem migration, sem trigger, sem backfill.

## Resultado esperado

- **ISOTÔNICO POWER**: já encontra histórico → após correção, é redistribuído para PREZUNIC BARRA dentro da área (CNPJ casa direto).
- **MACARRÃO FETUCCINE**: encontra histórico via master irmão (Correção 1) → redistribuído para o mercado da última compra.
- **PAPEL HIGIÊNICO DELUXE**: idem.
- **ARROZ COPARROZ**: continua sem histórico (variante/marca diferente do estoque) → permanece em "Sem preço" — comportamento correto.
- Itens livres manuais (Lasanha, Picanha, Laranja, Alface) na outra lista: continuam em "Lembretes".

## Validação

1. ISOTÔNICO POWER aparece **dentro de PREZUNIC BARRA** com R$ 5,19, data 15/04/2026, badge "Aguardando normalização".
2. MACARRÃO FETUCCINE e PAPEL HIGIÊNICO aparecem dentro do mercado da última compra com badge.
3. ARROZ COPARROZ permanece em "📋 Produtos sem preço" (correto — produto diferente).
4. Logs novos `[HIST] Master sem precos_atuais` e `[REDIST-FALHOU]` permitem diagnóstico futuro.
5. Comparação cruzada, swipe, undo, edição, lazy loading, área de atuação: inalterados.
6. Cenário oposto (item normalizado com preço atual): continua exatamente como hoje.

