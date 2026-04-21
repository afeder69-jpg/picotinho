
# Correção revisada — unificar itens com histórico em grupos de mercado e esvaziar corretamente “Produtos sem preço”

## Diagnóstico confirmado

O problema atual está majoritariamente no backend, não no frontend nem em cache:

1. **O frontend não está reclassificando nada sozinho.**
   `ListaCompras.tsx` renderiza diretamente:
   - `comparacao.otimizado.mercados`
   - `comparacao.produtosSemPreco`

   Portanto, se um item continua em “Produtos sem preço”, ele já veio assim da Edge Function.

2. **A redistribuição já existe, mas falha em dois pontos reais:**
   - **ISOTÔNICO POWER 500ML**: o histórico é encontrado, porém o match com mercado falha porque `PREZUNIC BARRA` não casa com os mercados retornados pela área. Hoje o mercado próximo sai como razão social crua (`CENCOSUD BRASIL COMERCIAL SA`) e, além disso, esse CNPJ pode estar fora do raio. Resultado: o item volta para `produtosSemPreco`.
   - **MACARRÃO / PAPEL HIGIÊNICO**: o histórico ainda não está sendo recuperado com consistência porque a busca em `estoque_app` e `notas_imagens` usa janela curta (`limit 50`). Para um usuário com centenas de registros, os candidatos certos podem simplesmente não entrar na amostra.

3. **Não há evidência de descarte posterior no frontend.**
   Se a Edge Function injetar corretamente, a UI principal já mostra os itens no padrão de mercado.

---

## Regra de negócio que será aplicada

### Classificação final
- **Item livre manual** → continua em “Lembretes / Itens livres”.
- **Item sem nenhum histórico recuperável** → continua em “Produtos sem preço”.
- **Item com histórico válido (mercado + preço + data)** → **nunca mais fica em “Produtos sem preço”**.

### Exibição do item com histórico válido
Ele deve aparecer em um agrupamento de mercado, com:
- nome do mercado
- preço
- data
- composição do total daquele grupo
- badge discreto “Aguardando normalização”

### Proteção da comparação cruzada
Mesmo aparecendo dentro de um mercado:
- **não participa** de equivalência inteligente entre mercados
- **não entra** em `melhor_preco`
- **não entra** em `economia`
- **não entra** na `TabelaComparativa`

---

## Implementação proposta

## 1) Corrigir a busca de histórico para não perder candidatos reais

### Arquivo
- `supabase/functions/comparar-precos-lista/index.ts`

### Mudança
Substituir a busca histórica baseada em “últimos 50 registros” por busca **direcionada por tokens do item**.

### Ajuste no `estoque_app`
Em vez de:
- pegar só os 50 mais recentes do usuário
- filtrar em memória

Passar a:
- extrair 2–4 tokens fortes do nome do item
- consultar `estoque_app` do usuário com `or(...)` por esses tokens
- trazer um conjunto maior e relevante (ex.: até 150/200 candidatos)
- aplicar o `token-cover + lock de variante` em memória
- desempatar por score e recência

Isso corrige os casos em que:
- o produto existe no estoque do usuário
- mas não está entre os 50 registros mais recentes

### Ajuste no fallback de `notas_imagens`
Mesma estratégia:
- ampliar a janela de notas analisadas
- priorizar notas que contenham tokens do item
- aplicar o mesmo match conservador em memória

### Salvaguardas mantidas
- lock de variante
- tokens neutros
- sem fuzzy global agressivo
- sem cruzar histórico entre usuários

---

## 2) Separar dois destinos para itens com histórico

### Arquivo
- `supabase/functions/comparar-precos-lista/index.ts`

Hoje existe só este comportamento:
- se o estabelecimento casa com mercado da área → injeta
- se não casa → volta para `produtosSemPreco`

Isso não atende mais a regra.

### Novo comportamento
Após `buscarUltimoPrecoConhecido`:

#### Caso A — histórico casa com um mercado da área
Injetar em:
- `otimizado.mercados`
- `comparacao[mercadoX].produtos`

com:
- `historico: true`
- `aguardando_normalizacao: true`

e somar no total desse mercado.

#### Caso B — histórico existe, mas o mercado **não está na área**
**Não** mandar para `produtosSemPreco`.

Criar novo agrupamento de resposta:
- `mercadosHistorico`

Estrutura igual à de mercado:
- `id`
- `nome`
- `cnpj`
- `distancia` opcional/null
- `historico_fora_area: true`
- `total`
- `produtos`

Assim, o item continua no padrão visual de mercado, sem poluir a comparação da área.

### Resultado esperado
- `ISOTÔNICO POWER 500ML` sai de “Produtos sem preço”
- aparece em um grupo de mercado histórico (`PREZUNIC BARRA`)
- com preço, data e badge
- sem entrar na otimização da área

---

## 3) Normalizar corretamente o nome do estabelecimento da área

### Arquivo
- `supabase/functions/buscar-supermercados-area/index.ts`

### Problema atual
A lista de mercados da área está retornando nome bruto de `supermercados.nome`, enquanto a memória do projeto define a hierarquia:
1. `normalizacoes_estabelecimentos`
2. `supermercados`
3. nome original da nota

### Correção
Ao montar o payload de mercados:
- resolver o nome de exibição por CNPJ usando `normalizacoes_estabelecimentos`
- usar o nome normalizado quando existir
- manter o CNPJ no payload como identificador estável

### Efeito
Quando o mercado da área e o histórico forem o mesmo estabelecimento real, o match melhora muito:
- `PREZUNIC BARRA` deixa de competir contra `CENCOSUD BRASIL COMERCIAL SA`
- outros casos de fantasia vs razão social também passam a casar corretamente

---

## 4) Ajustar a montagem final da resposta para não reter itens históricos em `produtosSemPreco`

### Arquivo
- `supabase/functions/comparar-precos-lista/index.ts`

### Mudança
A classificação final precisa ficar explícita em 3 saídas:

- `otimizado.mercados` → mercados da área com preços atuais + históricos casados à área
- `mercadosHistorico` → mercados históricos válidos fora da área
- `produtosSemPreco` → somente itens realmente sem histórico recuperável

### Regra de consistência
Se `ultimo_preco` existir e tiver `valor + data + estabelecimento`, o item:
- sai de `produtosSemPreco`
- entra em um dos dois grupos acima

---

## 5) Renderizar `mercadosHistorico` no mesmo padrão visual dos mercados

### Arquivo
- `src/pages/ListaCompras.tsx`

### Mudança
Manter os grupos de mercado atuais como estão.

Depois deles, renderizar uma nova seção com o mesmo padrão de cards de mercado usando `GrupoMercado`, por exemplo:
- “Histórico fiscal por mercado”

Cada grupo dessa seção virá de `comparacao.mercadosHistorico`.

### Importante
Isso preserva:
- leitura unificada por mercado
- total por mercado
- badge visual no item
- separação semântica da comparação da área

### O que sai da tela
A seção “Produtos sem preço nos mercados próximos” passa a mostrar apenas o resíduo real:
- itens sem qualquer histórico recuperável

---

## 6) Não contaminar tabs, resumo otimizado e tabela comparativa

### Arquivos
- `src/components/listaCompras/TabelaComparativa.tsx`
- opcionalmente `src/components/listaCompras/CardResumoOtimizado.tsx`
- opcionalmente `src/components/listaCompras/ComparacaoTabs.tsx`

### Regra
`mercadosHistorico`:
- não entra nas tabs da comparação
- não entra no resumo “otimizado”
- não entra na tabela cruzada
- não altera economia entre mercados da área

Os itens históricos fora da área aparecem só como agrupamento visual de mercado, não como candidatos da comparação.

---

## 7) Logs e validação dirigidos

### Arquivo
- `supabase/functions/comparar-precos-lista/index.ts`

Adicionar logs claros por item:
- `[HIST-AREA]` → histórico encontrado e injetado em mercado da área
- `[HIST-FORA-AREA]` → histórico encontrado e enviado para `mercadosHistorico`
- `[HIST-SEM-DADOS]` → sem histórico recuperável
- `[HIST-CANDIDATOS]` → quantidade de candidatos consultados no estoque/notas

Isso permite validar rapidamente:
- por que o isotônico não entrou antes
- se macarrão e papel agora foram encontrados
- se arroz continua corretamente como sem histórico

---

## Arquivos a alterar

1. `supabase/functions/comparar-precos-lista/index.ts`
   - busca histórica direcionada por tokens
   - nova classificação final
   - novo payload `mercadosHistorico`
   - logs de rastreabilidade

2. `supabase/functions/buscar-supermercados-area/index.ts`
   - normalizar nome exibido do mercado por CNPJ via `normalizacoes_estabelecimentos`

3. `src/pages/ListaCompras.tsx`
   - renderizar `mercadosHistorico` com o mesmo componente de mercado
   - deixar `produtosSemPreco` só para casos sem histórico real

Sem migration, sem backfill, sem alteração em swipe, undo, edição, realtime, lazy loading, comparação cruzada ou área de atuação.

---

## Resultado esperado após a correção

### Deve sair de “Produtos sem preço”
- ISOTÔNICO POWER 500ML → grupo de mercado histórico `PREZUNIC BARRA`
- MACARRÃO FETUCCINE SANTA AMÁLIA 500G → grupo do mercado recuperado do histórico
- PAPEL HIGIÊNICO DELUXE COTTON FOLD 30M 24 UNIDADES → grupo do mercado recuperado do histórico

### Deve permanecer em “Produtos sem preço”
- somente itens sem histórico realmente recuperável
- ex.: ARROZ COPARROZ, se continuar sem match seguro

---

## Critérios de aceite

1. Nenhum item com `ultimo_preco + estabelecimento_nome + data` permanece em “Produtos sem preço”.
2. Itens históricos aparecem em grupos de mercado com total correto.
3. Itens históricos continuam marcados com badge discreto “Aguardando normalização”.
4. `TabelaComparativa` continua ignorando `historico === true`.
5. Resumo otimizado e economia continuam representando apenas mercados da área com comparação válida.
6. Swipe, undo, edição, marcar comprado, realtime e lazy loading permanecem inalterados.
