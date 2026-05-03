
# Plano técnico v3 — Refator do motor de normalização

Versão final consolidada. Incorpora os 2 ajustes adicionais: **bloqueio de criação por similaridade textual** e **status `provisorio` para masters novos**.

---

## Causa raiz (confirmada)

- 481 de 482 candidatos pendentes têm `confianca_ia=0` e sugestões NULL.
- `process-receipt-full` cria placeholder com hash `${notaId}_${nomeUpper}`.
- `processar-normalizacao-global` (linhas 245-312) detecta o placeholder via `nota_item_hash`, cai em `if (jaExiste) continue` e **nunca chama a IA**.
- Adicional: `LIMIT 1` no loop de notas + ausência de cron específico para candidatos órfãos.

---

## Ordem de execução

```text
1. Fase 1  → Fechar ciclo da IA           (destrava o pipeline)
2. Fase 9  → Reprocessar 482 pendentes    (ganho imediato)
3. Fase 2  → Classificação de EAN          (segurança de matching)
4. Fase 3  → Contexto rico para IA         (qualidade das decisões)
5. Fase 5  → Categoria obrigatória         (pré-requisito da Fase 8)
6. Fase 4  → Comercial vs comparável       (chaves estruturais)
7. Fase 7  → Níveis de confiança           (decidirAcao)
8. Fase 8  → Anti-duplicatas + provisório  (controle final)
9. Fase 6  → Aprendizado humano            (loop contínuo)
```

Cada fase é deployável e reversível de forma independente.

---

## FASE 1 — Fechar o ciclo da IA

- `process-receipt-full/index.ts` (2070-2125): adicionar `precisa_ia=true` no placeholder.
- `processar-normalizacao-global/index.ts` (245-312): se `jaExiste.status='pendente' AND jaExiste.confianca_ia=0` → executar pipeline e fazer `UPDATE` no registro existente.
- Remover `LIMIT 1` da busca de notas.
- **Nova:** `processar-candidatos-pendentes` (cron, lote 20, a cada 2min).

---

## FASE 9 — Reprocessar 482 pendentes

- **Nova:** `reprocessar-candidatos-orfaos` (admin, `requireMaster`).
- Filtro: `status='pendente' AND confianca_ia=0`.
- Lote 20, retorna `{processados, auto_aprovados, para_revisao, falhas}`.
- Vincula `produto_master_id` em `estoque_app` quando auto-aprovado. Nunca toca quantidade/preço.
- Botão em `/admin/normalizacao` com barra de progresso.

---

## FASE 2 — Classificação de EAN (2 camadas)

- Migration: `+ tipo_ean` em `produtos_candidatos_normalizacao` e `produtos_master_global`.
- **Novo:** `_shared/classificar-ean.ts`.
- Camada 1 (regex): `ausente` | `balanca_peso_variavel` (prefixo 2) | `global` (789/790 ou 8-14 dígitos válidos) | `local_mercado`.
- Camada 2 (comportamental): ≥2 CNPJs em `precos_atuais` confirma `global`; 1 CNPJ rebaixa para `local_mercado`.
- Apenas `tipo_ean='global'` é verdade absoluta no matching.

---

## FASE 3 — Contexto completo para a IA (tool calling estruturado)

Payload enviado:
```json
{
  "produto_atual": {"texto_original","ean","tipo_ean","cnpj_mercado","quantidade","unidade","preco_unitario","preco_total","marca_detectada","categoria_preliminar"},
  "candidatos_similares": [/* até 10 */],
  "sinonimos_globais": [/* até 10 por trigram > 0.3 */],
  "decisoes_humanas": {
    "recentes_semelhantes": [/* até 5 */],
    "padroes_recorrentes": [/* até 5 mais frequentes */],
    "alta_confianca_historica": [/* até 5 com taxa_aprovacao ≥ 0.90 */]
  }
}
```

Saída obrigatória (tool schema): `nome_padrao, nome_base, tipo, marca, categoria (enum 11), tipo_embalagem, quantidade, unidade, confianca, acao_sugerida (vincular_master|criar_novo|incerto), master_id_sugerido, razao`.

---

## FASE 5 — Categoria obrigatória (sinal estrutural forte)

- **Novo:** `_shared/categoria-heuristica.ts` (palavras-chave + unidade).
- Categoria nunca NULL. Inválida → `OUTROS` + `revisao_categoria=true`.
- Categoria entra como **filtro obrigatório** em todas as buscas de similaridade.
- Categorias divergentes nunca formam equivalência, mesmo com mesmo `nome_base + qtd_base + unidade_base`.

---

## FASE 4 — Comercial vs comparável (chave refinada)

Migration em `produtos_master_global`:
- `+ tipo_produto text` (integral, desnatado, light, zero, tipo_1, extra_virgem, etc.)
- `+ chave_comparavel text` = `nome_base | tipo_produto | categoria | qtd_base | unidade_base | tipo_embalagem`
- `+ chave_comercial text` = `chave_comparavel | marca | coalesce(ean_global,'')`
- Índices em ambas.
- **Novo:** `_shared/tipos-produto.ts` (dicionário canônico por categoria).

---

## FASE 7 — Níveis de confiança (`decidirAcao`)

| Confiança | Evidência | Ação |
|---|---|---|
| ≥95 | qualquer | `auto_aprovado` |
| 85-94 | EAN global ∨ chave_comercial exata ∨ sinônimo global exato | `auto_aprovado` |
| 85-94 | sem evidência forte | `pendente_revisao` |
| 70-84 | qualquer | `pendente_revisao` (sugestão preenchida) |
| <70 | qualquer | `pendente` (com `razao` obrigatória) |

Match estrutural:
- **forte** = EAN global ∨ chave_comercial exata ∨ sinônimo global exato.
- **médio** = chave_comparavel exata + mesma marca ∨ trigram nome_base ≥ 0.85 + mesma categoria + mesma qtd_base.
- **fraco** = trigram 0.6-0.85 + mesma categoria.

Categoria divergente → downgrade automático para `pendente_revisao`.

---

## FASE 8 — Anti-duplicatas + Master Provisório

### 8.1 Pipeline de matching antes de criar master

1. EAN global exato.
2. Sinônimo global exato.
3. `chave_comercial` exata.
4. `chave_comparavel` + mesma marca.
5. Trigram `nome_base` ≥ 0.85 + mesma categoria + mesma qtd_base + mesma unidade_base.

### 8.2 Regra rígida de criação automática

Só cria novo master se TODOS forem verdadeiros:
- ✅ Todas as 5 estratégias acima falharam.
- ✅ `confianca_ia ≥ 92`.
- ✅ NÃO existe match estrutural médio nem forte.
- ✅ `acao_sugerida = 'criar_novo'` (não `incerto`).
- ✅ Categoria definida (não `OUTROS` por fallback).
- ✅ **NOVO — Bloqueio por similaridade textual:** NÃO existe NENHUM candidato com:
  - `similarity(nome_base, sugestao.nome_base) > 0.75` na mesma categoria, OU
  - match estrutural **fraco** (trigram 0.6-0.85 + mesma categoria), OU
  - match estrutural **médio**.
  
  Se qualquer desses existir → **forçar `pendente_revisao`** apresentando os candidatos próximos para decisão humana, mesmo com confiança ≥ 92.

### 8.3 Master Provisório (anti-cascata de erros) — NOVO

Migration:
```sql
ALTER TABLE produtos_master_global
  ADD COLUMN provisorio boolean NOT NULL DEFAULT false,
  ADD COLUMN ocorrencias_notas int NOT NULL DEFAULT 0,
  ADD COLUMN promovido_em timestamptz,
  ADD COLUMN promovido_por text;  -- 'auto_threshold' | 'manual' | uuid do master humano
```

Estados de `produtos_master_global.status`:
- `provisorio` (NOVO) — criado automaticamente pela IA, ainda não confiável.
- `ativo` — validado (manual ou por threshold).
- `inativo` — descontinuado.

Comportamento:

| Aspecto | `provisorio` | `ativo` |
|---|---|---|
| Criado por | IA automática | manual ∨ promoção |
| Aparece em buscas de match para outros produtos | **NÃO** | SIM |
| Usado como `candidato_similar` enviado à IA | **NÃO** | SIM |
| Usado como verdade em sinônimos / consolidação | **NÃO** | SIM |
| Vincula estoque do usuário que originou | SIM | SIM |
| Aparece em UI normal de catálogo | filtrado (badge "Provisório") | SIM |
| Aparece em fila de revisão admin | SIM (destaque) | não |

Promoção automática para `ativo`:
- Quando `ocorrencias_notas ≥ 3` (configurável via `app_config.master_promocao_min_notas`, default 3).
- Trigger em `estoque_app` (ou função periódica) incrementa `ocorrencias_notas` por nota distinta (`nota_imagem_id`) que vincula o master.
- Ao atingir threshold, atualiza `status='ativo'`, `provisorio=false`, `promovido_em=now()`, `promovido_por='auto_threshold'`.

Promoção manual:
- Botão "Promover para ativo" em `/admin/masters` na lista filtrada por `provisorio=true`.
- Define `promovido_por = auth.uid()`.

Constraint UNIQUE em `chave_comercial`:
```sql
CREATE UNIQUE INDEX ux_master_chave_comercial_ativo
  ON produtos_master_global(chave_comercial)
  WHERE status='ativo' AND chave_comercial IS NOT NULL;
```
Aplicada após `consolidar-masters-duplicados` rodar no passivo. **Provisórios não entram na constraint** (índice condicional por `status='ativo'`), permitindo múltiplos provisórios convivendo até validação.

Garantias adicionais:
- Reprocessamento (Fase 9) tenta sempre **vincular a `ativo`** primeiro; só cria provisório se passar pela regra rígida 8.2.
- Quando dois provisórios viram candidatos do mesmo produto futuro, a IA pode sugerir consolidação (entra em `pendente_revisao` com ambos listados).

---

## FASE 6 — Aprendizado humano (loop contínuo)

Migration: `normalizacao_decisoes_log` com agregados (`ocorrencias`, `taxa_aprovacao`).

Gravação:
- `aplicar-candidatos-aprovados`
- Edge dedicada chamada por `GerenciarMasters.tsx` em corrigir/rejeitar.
- Promoção manual de provisório também registra entrada (`decisao='promoveu_provisorio'`).

Consumo (Fase 3): 3 blocos — recentes semelhantes, padrões recorrentes, alta confiança histórica.

---

## NOVO — Logging de erros da IA

```sql
CREATE TABLE ia_normalizacao_erros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid REFERENCES produtos_candidatos_normalizacao(id) ON DELETE CASCADE,
  texto_original text,
  tipo_erro text NOT NULL,  -- timeout|parse|invalid_response|gateway_429|gateway_402|gateway_5xx|tool_call_missing|desconhecido
  http_status int,
  modelo text,
  mensagem text,
  payload_enviado jsonb,
  resposta_bruta jsonb,
  tentativa int DEFAULT 1,
  criado_em timestamptz DEFAULT now()
);
CREATE INDEX ix_ia_erros_tipo ON ia_normalizacao_erros(tipo_erro, criado_em DESC);
```

Wrapper único `_shared/ia-cliente.ts` envolve toda chamada do gateway, classifica e loga, com retry exponencial 1x para 429/5xx. Painel admin em `/admin/normalizacao` mostra contagens por tipo nas últimas 24h.

---

## Resumo consolidado de impacto

### Tabelas
| Tabela | Mudança |
|---|---|
| `produtos_candidatos_normalizacao` | + `tipo_ean`, + `precisa_ia`, + `revisao_categoria`; novo status `pendente_revisao` |
| `produtos_master_global` | + `tipo_ean`, + `tipo_produto`, + `chave_comparavel`, + `chave_comercial`, + `provisorio`, + `ocorrencias_notas`, + `promovido_em`, + `promovido_por`; novo status `provisorio`; UNIQUE condicional em `chave_comercial` para `ativo` |
| `normalizacao_decisoes_log` | criar (com agregados) |
| `ia_normalizacao_erros` | **nova** |

### Edge functions
| Função | Ação |
|---|---|
| `process-receipt-full` | flag `precisa_ia` no placeholder |
| `processar-normalizacao-global` | core refactor (não pular órfãos, novo prompt, decidirAcao, anti-duplicata, bloqueio por similaridade, criação como `provisorio`) |
| `processar-candidatos-pendentes` | **nova** — cron 2min, lote 20 |
| `reprocessar-candidatos-orfaos` | **nova** — botão admin |
| `aplicar-candidatos-aprovados` | + log decisão humana |
| `promover-master-provisorio` | **nova** — manual + verificação threshold |
| `_shared/classificar-ean.ts` | **nova** |
| `_shared/categoria-heuristica.ts` | **nova** |
| `_shared/tipos-produto.ts` | **nova** |
| `_shared/decidir-acao.ts` | **nova** |
| `_shared/ia-cliente.ts` | **nova** — wrapper com logging |

### Frontend
- `/admin/normalizacao`: botão de reprocessamento + barra de progresso + painel de erros IA.
- `/admin/masters` (`GerenciarMasters.tsx`): filtro/badge "Provisório" + botão "Promover para ativo".

### Riscos globais e mitigações
- **Custo IA**: ~482 chamadas iniciais + ~5/min em regime. Mitigado por lote 20/2min e cache por hash.
- **Quebra de fluxos atuais (RJ/CE/NFC-e/NFe/estoque/preços)**: ZERO mudança. Todas alterações são aditivas.
- **Crescimento descontrolado do catálogo**: bloqueado por (a) regras rígidas 8.2, (b) bloqueio por similaridade textual, (c) status `provisorio` que isola erros.
- **Erros da IA viram referência**: impossível — provisórios não entram em buscas de matching nem em contexto da IA.
- **Constraint UNIQUE**: aplicada só em `ativo`, após consolidação do passivo.
- **Variação de decisões da IA**: mitigada por aprendizado humano (Fase 6) e logging (`ia_normalizacao_erros`).
- **Reabrir candidatos já decididos**: filtro estrito `confianca_ia=0 AND status='pendente'`.

Pronto para autorização.
