
# Plano — Proteções obrigatórias antes de retomar reprocessamento

Pausa imediata do botão de reprocessamento e implementação de três barreiras de segurança. Nenhum lote da IA volta a rodar até que as 3 estejam ativas e validadas.

## 1. Pausa imediata (defensivo)

- `src/pages/admin/NormalizacaoGlobal.tsx` (linha 2721): botão "Reprocessar Pendentes Órfãos (IA)" fica `disabled` permanentemente com texto "Pausado — proteções pendentes" e tooltip explicando o motivo. Reabre só após validação das 3 etapas.
- `supabase/functions/reprocessar-candidatos-orfaos/index.ts`: kill-switch no início — lê `app_config.normalizacao_orfaos_pausado` (default `true`) e retorna `423 Locked` se ativo. O admin libera manualmente quando tudo estiver verificado.
- Cron (se existir agendado para essa função) também respeita o flag.

## 2. Wrapper de IA com observabilidade — `_shared/ia-cliente.ts`

Função única que toda chamada de normalização à IA passa a usar. Substitui o `fetch` cru atualmente em `processar-normalizacao-global/index.ts` (linha 1134).

Responsabilidades:
- Timeout explícito (45s) via `AbortController`.
- Captura e classifica falhas em `tipo_erro`:
  - `timeout` (AbortError)
  - `gateway_429` / `gateway_402` / `gateway_5xx` (HTTP status)
  - `parse` (JSON.parse falhou no conteúdo)
  - `invalid_response` (JSON sem campos obrigatórios mínimos: `nome_padrao`, `categoria`, `confianca`)
  - `tool_call_missing` (quando migrarmos para tool calling — placeholder pronto)
  - `desconhecido` (qualquer outro `Error`)
- Em todo caminho de falha, grava em `ia_normalizacao_erros` com: `candidato_id` (quando disponível), `texto_original`, `tipo_erro`, `http_status`, `modelo`, `mensagem`, `payload_enviado`, `resposta_bruta`, `tentativa`.
- Retry exponencial de 1 tentativa só para `gateway_429` e `gateway_5xx` (1s e 3s). `402` nunca retenta.
- Retorna `{ ok: true, data }` ou `{ ok: false, tipo_erro, mensagem }` — chamador decide o que fazer (manter `pendente`, marcar como falha, etc.).
- Deixa o candidato com `precisa_ia=true` e `confianca_ia=0` quando `ok=false`, para que o passivo continue rastreável (não some da fila).

Integração mínima:
- `processar-normalizacao-global/index.ts`: a função `normalizarComIA` (em torno da linha 1133) passa a chamar o wrapper. Quando `ok=false`, em vez de devolver fallback `{ confianca: 30, razao: "Erro na IA: ..." }` (linha 1290), devolve `null` e o loop principal pula a criação de candidato/master mantendo o registro pendente. Hoje esse fallback é exatamente o que faz a IA "passar batido" sem deixar rastro — esta é a causa raiz dos 466 sumiços silenciosos.

## 3. Bloqueio antecipado de duplicatas (Fase 8 parcial)

Novo módulo `_shared/anti-duplicata.ts` chamado dentro de `processar-normalizacao-global` **logo antes** de `criarProdutoMaster` (linha 493).

Sequência de checks (qualquer hit positivo → bloqueia criação):
1. **Match estrutural forte**: existe master `ativo` com mesmo EAN canônico ou mesmo `nome_padrao` exato (case-insensitive) na mesma categoria.
2. **Match estrutural médio**: existe master `ativo` com `nome_base` igual + mesma marca + mesma categoria, ou trigram(`nome_base`) ≥ 0.85 + mesma categoria + mesma `qtd_base` + mesma `unidade_base`.
3. **Similaridade textual**: existe master `ativo` com `similarity(nome_base, sugestao.nome_base) > 0.75` na mesma categoria.

Comportamento ao bloquear:
- NÃO cria master novo.
- Cria candidato com `status='pendente'`, `precisa_ia=false`, `confianca_ia` da IA, e popula `sugestao_produto_master` com **a lista de candidatos próximos em JSON** (campo já existente `dados_brutos` ou novo `candidatos_proximos jsonb`).
- Marca `motivo_bloqueio = 'similaridade_alta' | 'match_estrutural_medio' | 'match_estrutural_forte'`.
- Esses casos passam a aparecer numa nova aba "Revisão por similaridade" em `/admin/normalizacao` (somente leitura nesta fase — UI completa fica para depois).

Implementação SQL de apoio: usa `pg_trgm` já habilitado (memória `RPC Similarity Fix` confirma `real`). Nenhuma RPC nova obrigatória — query parametrizada via cliente.

## 4. Master provisório

Migração:
```sql
ALTER TABLE produtos_master_global
  ADD COLUMN IF NOT EXISTS provisorio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocorrencias_notas int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promovido_em timestamptz,
  ADD COLUMN IF NOT EXISTS promovido_por text;

CREATE INDEX IF NOT EXISTS ix_master_provisorio ON produtos_master_global(provisorio) WHERE provisorio = true;
```

Não altera `status` enum — `provisorio` é flag booleano paralelo (mais simples, evita refator dos consumers que filtram por `status='ativo'`). Masters provisórios continuam com `status='ativo'` para consumo do dono, mas o flag os exclui de buscas de matching.

Mudanças de código:
- `criarProdutoMaster` (linha 1298): aceita parâmetro `provisorio: boolean`. Quando chamado pelo fluxo da IA, passa `true`. RPC `upsert_produto_master` recebe novo argumento `p_provisorio` (migração da função também).
- Buscas de matching usadas pela IA filtram `provisorio = false`:
  - `processar-normalizacao-global` linhas 270, 331, 978, 1314, 1507 (todas as `from('produtos_master_global').select(...)` em contexto de matching/candidatos).
  - Sinônimos globais e RAG: idem.
- Estoque do dono: continua vinculando normalmente (provisório não bloqueia uso pessoal, só não vira referência global).

Promoção:
- Trigger em `estoque_app` (AFTER INSERT/UPDATE de `produto_master_id`): incrementa `ocorrencias_notas` por `nota_imagem_id` distinto. Ao atingir threshold (`app_config.master_promocao_min_notas`, default 3), seta `provisorio=false`, `promovido_em=now()`, `promovido_por='auto_threshold'`.
- Manual: nova edge `promover-master-provisorio` (master-only) + botão em `GerenciarMasters.tsx` filtrado por `provisorio=true` (UI completa em fase posterior; nesta entrega entra apenas a edge + listagem mínima).

## 5. Limpeza dos 26 masters criados na primeira rodada (consulta-only nesta fase)

Não vamos deletar nem modificar agora — apenas marcar todos os 26 com `provisorio=true` retroativamente via `UPDATE` único, para que parem imediatamente de ser usados como referência por novos matches. As duplicatas detectadas no diagnóstico (Glória ×2, Rivel ×2, Alcatra, Trident, Pão Francês, Powerade, Bis Lacta, etc.) entram na fila de "Promoção/Consolidação manual" para o admin decidir caso a caso.

## 6. Ordem de release e validação

```text
Passo A — Migração: provisorio + ia_normalizacao_erros (ia_normalizacao_erros já existe)
Passo B — _shared/ia-cliente.ts + integração
Passo C — _shared/anti-duplicata.ts + integração
Passo D — Marcar 26 masters recém-criados como provisorio=true
Passo E — Trigger de promoção + edge promover-master-provisorio
Passo F — Liberar app_config.normalizacao_orfaos_pausado=false
Passo G — Reprocessar 1 lote pequeno (5 notas) e auditar
```

Cada passo é deployável e reversível. Só após Passo G limpo (sem novas duplicatas, erros aparecendo em `ia_normalizacao_erros` quando ocorrerem) o botão volta a ficar disponível na UI.

## Detalhes técnicos

### Tabelas
- `produtos_master_global`: + `provisorio`, `ocorrencias_notas`, `promovido_em`, `promovido_por`.
- `produtos_candidatos_normalizacao`: + `motivo_bloqueio text NULL`, + `candidatos_proximos jsonb NULL`.
- `ia_normalizacao_erros`: já existe (criada na Fase 1). Nenhuma alteração.
- `app_config`: linhas `normalizacao_orfaos_pausado=true`, `master_promocao_min_notas=3`.

### Edge functions
- **Nova** `_shared/ia-cliente.ts` (módulo, não edge).
- **Nova** `_shared/anti-duplicata.ts` (módulo).
- **Nova** `promover-master-provisorio` (master-only).
- **Modificada** `processar-normalizacao-global`: usa wrapper IA + anti-duplicata + cria master como `provisorio=true`. Filtra `provisorio=false` em todas as queries de matching.
- **Modificada** `reprocessar-candidatos-orfaos`: kill-switch via `app_config`.
- **Modificada** RPC `upsert_produto_master`: aceita `p_provisorio boolean default true`.

### Frontend
- `NormalizacaoGlobal.tsx`: botão desabilitado + badge "Pausado".
- (fora do escopo desta entrega) Aba de revisão por similaridade — apenas backend nesta fase.

### Riscos e mitigações
- **Quebra de fluxos existentes (RJ/CE/NFC-e/NFe/estoque/preços)**: zero — `provisorio=false` é default; só novos masters da IA nascem `true`. Tudo o que já existe continua `false`.
- **RPC `upsert_produto_master` quebrada**: novo parâmetro com default; chamadas legadas continuam funcionais.
- **Trigger de promoção spam**: usa `nota_imagem_id` distinto; idempotente.
- **Custo IA durante validação**: lote G é 5 notas apenas.
- **Performance da consulta de similaridade**: índice GIN trigram já existe em `produtos_master_global.nome_base` (memória `RPC Similarity Fix`); custo aceitável.

Aguardo aprovação para executar na ordem A→G.
