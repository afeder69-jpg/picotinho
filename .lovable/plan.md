

# Plano revisado: Pendentes como produtos reais + Reconciliação GLOBAL pós-normalização (em 2 fases)

## Diretriz de negócio reafirmada

Quando um master normaliza um produto pendente, **todas as listas de todos os usuários** que tenham aquele item pendente devem ser reconciliadas — não só as do mesmo `user_id`. O plano abaixo entrega isso, mas em **duas fases** porque o match global exige salvaguardas que não cabem na mesma janela da Fase 1 sem aumentar risco.

---

## FASE 1 — Tratar pendentes como produtos reais (entrega imediata)

Idêntica ao plano anterior, sem mudança no escopo.

### 1.1 Definição dos três estados

| Estado | Critério em `listas_compras_itens` | Comparação cruzada |
|---|---|---|
| Livre manual | `item_livre = true` | Não |
| Pendente | `item_livre = false` E `produto_id IS NULL` | **Não** (proteção contra falso positivo) |
| Normalizado | `item_livre = false` E `produto_id IS NOT NULL` | Sim, via `produto_master_id` |

### 1.2 Histórico do pendente (`comparar-precos-lista`)

Para cada pendente, buscar último preço **restrito ao próprio usuário**:
1. `estoque_app` do usuário, match por nome normalizado (UPPER + TRIM) → `preco_unitario_ultimo`, `updated_at`, último estabelecimento da nota mais recente.
2. Fallback: JSONB `produtos` em `notas_imagens` (`processada=true`) do mesmo usuário.

Devolve `ultimo_preco = {valor, data, estabelecimento_nome}` ou `null`. Sem cruzar dados de outros usuários (privacidade + anti-falso-positivo).

### 1.3 Renderização

- Pendente com histórico → seção "📋 Sem preço nos mercados próximos" exibindo "Último preço em <mercado>: R$ X,XX (data)" + bolinha vermelha + badge "Aguardando normalização".
- Pendente sem histórico → mesma seção, sem preço.
- Livre manual → seção "💬 Lembretes", sem busca.

### 1.4 Comparação cruzada

Filtro duro: somente `produto_master_id IS NOT NULL` entra em `produtosPorMercado` e na `TabelaComparativa`. Pendente nunca vaza para comparação cruzada.

### Arquivos da Fase 1
- `supabase/functions/comparar-precos-lista/index.ts` — popular `ultimo_preco` para pendentes (escopo do usuário) e blindar `produtosPorMercado`.
- `src/components/listaCompras/ItemProdutoSemPreco.tsx` — exibir mercado/data/badge.
- `src/pages/ListaCompras.tsx` — propagar `ultimo_preco` no mapeamento (se ainda não passa).

Sem migration, sem trigger, sem backfill. **Não toca em listas de outros usuários.**

---

## FASE 2 — Reconciliação GLOBAL pós-normalização

Entra **depois** que a Fase 1 estiver validada em produção. Aqui mora a regra de negócio "atualizar listas de todos os usuários".

### 2.1 Gatilho

Trigger AFTER UPDATE em `produtos_master_global` (não em `estoque_app`, porque master é o evento global real). Dispara quando:
- master é criado novo, OU
- master ganha/troca `nome_padrao`, `marca`, `ean` ou `sku_global`, OU
- master é absorvido por outro (consolidação) — propaga para o master destino.

A trigger chama `reconciliar_listas_globalmente(p_master_id, p_nomes_origem text[])`, onde `p_nomes_origem` é a lista de nomes/sinônimos conhecidos que devem casar com o master.

### 2.2 Critério de match GLOBAL (multicamadas)

Um item pendente em **qualquer** lista é vinculado ao master se passar em **pelo menos uma** das camadas — em ordem de confiança:

| Camada | Regra | Confiança |
|---|---|---|
| **A. EAN exato** | `item.ean_comercial` (quando existir no payload futuro) = `master.ean` | Máxima |
| **B. Nome igual ao `nome_padrao`** | UPPER+TRIM+sem-acento(`item.produto_nome`) == UPPER+TRIM+sem-acento(`master.nome_padrao`) | Alta |
| **C. Nome em `produtos_candidatos_normalizacao` aprovado** | Existe linha com `texto_original` = nome do item E `produto_master_id` = master destino E `status = 'aprovado'` | Alta (decisão humana) |
| **D. Nome em `normalizacoes_log` com `acao='vinculado'`** | Mesmo princípio, baseado em decisão registrada | Alta |
| **E. Match em `estoque_app` de qualquer usuário** | Existe `estoque_app` com aquele `produto_nome` e `produto_master_id` = master destino | Média-alta (alguém já confirmou o vínculo via fluxo normal de nota) |

Camadas A–D são suficientes sozinhas. Camada E é a ponte que captura os casos do usuário relatado: a Lasanha foi vinculada no estoque do João, então qualquer item pendente "Lasanha Sadia Peito de Peru 600g" em listas de outros usuários reconcilia com o mesmo master.

**Fora dessas cinco camadas: não reconcilia.** Sem fuzzy match global, sem similaridade probabilística, sem IA na hora — fuzzy/IA só roda no fluxo de criação/aprovação de master, que é o lugar onde já existe revisão humana.

### 2.3 Salvaguardas anti-falso-positivo

Aplicadas em todas as camadas:

1. `produto_id IS NULL` no item da lista (nunca sobrescreve vínculo existente).
2. `comprado = false` (não toca item já marcado como comprado — preserva histórico do usuário).
3. `item_livre = false` (livre manual nunca é tocado, mesmo que o nome bata).
4. Match de nome **normalizado**: UPPER + TRIM + remoção de acentos + colapso de espaços. Sem `ilike '%x%'`, sem substring — só igualdade exata após normalização.
5. **Lock de variante**: se o nome do item contém token de variante (sabor, peso, tipo) ausente no `nome_padrao` do master, não reconcilia. Reaproveita a lógica já existente de `product-variant-keyword-validation` da memória do projeto.
6. **Auditoria obrigatória**: cada update em `listas_compras_itens` por essa rotina insere uma linha em nova tabela `reconciliacao_listas_log` com `(item_id, lista_id, user_id, master_id, camada, nome_antes, nome_depois, executado_em)`. Permite rollback dirigido se algo der errado.
7. **Limite por execução**: a função processa no máximo N itens por chamada (ex: 5000) e loga overflow — evita lock prolongado em tabelas grandes.

### 2.4 Campos atualizados em `listas_compras_itens`

```sql
UPDATE listas_compras_itens SET
  produto_id   = <master_id>,
  item_livre   = false,
  produto_nome = <master.nome_padrao>
WHERE <salvaguardas 1–6 satisfeitas>;
```

Preservados: `quantidade`, `unidade_medida`, `comprado`, `lista_id`, `created_at`.

### 2.5 Diferença entre reconciliação global e comparação cruzada

| Aspecto | Reconciliação global | Comparação cruzada de mercados |
|---|---|---|
| Objetivo | Vincular item ao master | Decidir qual mercado tem melhor preço |
| Quando | Trigger pós-normalização | Cada abertura de "Preços" da lista |
| Quem dispara | Master ou fluxo de normalização automática | Usuário final |
| Critério | 5 camadas determinísticas com salvaguardas | Apenas itens já com `produto_master_id` |
| Risco | Vincular produto errado em escala | Sugerir preço errado |
| Mitigação | Camadas + lock de variante + auditoria | Filtro de `produto_master_id IS NOT NULL` (Fase 1 já garante) |

### 2.6 Backfill único (controlado)

Edge Function admin `reconciliar-listas-pendentes-global-backfill` (JWT + role master), que percorre `produtos_master_global` e dispara `reconciliar_listas_globalmente` para cada master existente. Roda **manual**, com dry-run primeiro (apenas lê e relata o que faria, sem escrever) e depois execução real. Resolve os 4 itens legados desta lista e equivalentes em todo o sistema.

### Arquivos da Fase 2

- Migration: tabela `reconciliacao_listas_log`, função `reconciliar_listas_globalmente`, função auxiliar `normalizar_nome_match`, trigger AFTER UPDATE em `produtos_master_global`.
- `supabase/functions/reconciliar-listas-pendentes-global-backfill/index.ts` (admin, dry-run + apply).
- Página admin opcional para visualizar `reconciliacao_listas_log` e desfazer entradas erradas (item-a-item) — pode ficar para iteração seguinte.

### O que NÃO é tocado em nenhuma fase

- Lógica de comparação de preços por mercado, área de atuação, agrupamento, otimizado.
- Swipe, undo, edição de quantidade, marcar comprado, exclusão, realtime, lazy loading.
- Fluxo de criação/aprovação de master, normalização automática na ingestão de notas.
- `EstoqueAtual.tsx` (origem já corrigida em iteração anterior).
- Listas de outros usuários **na Fase 1**.

---

## Matriz final

| Cenário | Fase 1 | Fase 2 |
|---|---|---|
| Item livre manual | Lembretes | Nunca tocado |
| Pendente sem histórico | Sem preço, sem valor | Reconcilia se master surgir |
| Pendente com histórico do próprio usuário | Sem preço, exibe último preço pessoal | Reconcilia se master surgir |
| Pendente equivalente em lista de outro usuário, master criado | Continua pendente | **Reconciliado automaticamente** se passar em A–E |
| Item já comprado | Não tocado | Não tocado |
| Item com vínculo já existente | Não tocado | Não tocado |
| Variante divergente (ex: sabor, peso) | — | Bloqueado pela salvaguarda 5 |

## Validação

**Fase 1**
1. Pendente com histórico aparece em "Sem preço" com último preço + badge "Aguardando normalização".
2. Pendente sem histórico aparece sem preço.
3. Livre manual continua em Lembretes.
4. Comparação por mercado não inclui pendentes.
5. Swipe, undo, comprado, edição: comportamento idêntico.

**Fase 2**
1. Master cria/normaliza produto → trigger reconcilia listas de todos os usuários que tenham pendentes equivalentes (camadas A–E).
2. Item com nome de variante divergente não é tocado (salvaguarda 5).
3. Item já comprado ou já vinculado não é tocado (salvaguardas 1–3).
4. `reconciliacao_listas_log` registra cada update com camada usada.
5. Backfill rodado em dry-run mostra prévia exata; rodado de verdade aplica e os 4 itens legados desta lista deixam de aparecer como livres.

## Resumo da divisão

- **Fase 1**: aprovar e implementar agora. Sem risco de afetar outros usuários. Resolve o problema visual imediato.
- **Fase 2**: aprovar separadamente após validar Fase 1. Entrega a regra de negócio global com salvaguardas explícitas e auditoria.

