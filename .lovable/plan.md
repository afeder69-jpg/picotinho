# Plano — Correção da identificação por EAN no pipeline de normalização

## Status

- ✅ **Fase 2 — Normalização canônica de EAN** (APLICADA)
- ✅ **Fase 1 — Backfill de EAN no catálogo master** (FUNÇÃO CRIADA — aguardando execução em dry_run)
- ⏳ **Fase 3 — Vincular órfãos por EAN** (FUNÇÃO CRIADA — aguardando dry_run + revisão antes de aplicar)

---

## Fase 2 — Normalização canônica de EAN ✅

**Causa raiz endereçada:** comparação `.eq('codigo_barras', ean)` falhava por diferença de zeros à esquerda (`07622...` vs `7622...`).

**Mudanças aplicadas:**

- `supabase/functions/process-receipt-full/index.ts`
  - Novas funções utilitárias `canonicalEAN()` e `eanVariants()` (cobrem padding 8/12/13/14 dígitos).
  - **Estratégia 0 (linhas ~1545)**: agora busca por `.in('codigo_barras', variantesEan)` e deduplica por `id`. Mantida a trava `length === 1` (proteção contra masters duplicados).
  - **Persistência segura do EAN no master (linhas ~1712)**: passa a verificar conflito por todas as variantes antes de gravar e sempre grava na forma canônica (sem zeros à esquerda).
  - **Filtro de variante (linhas ~1970)**: comparação de EAN entre nota e master agora usa `canonicalEAN()` em ambos os lados.

- `supabase/functions/processar-normalizacao-global/index.ts`
  - **Estratégia 0 (linhas ~314)**: mesma lógica de variantes + deduplicação.
  - **`criarProdutoMaster()`**: guard agora cobre variantes; gravação sempre na forma canônica.

**Impacto no comportamento existente:**
- Itens sem EAN: fluxo idêntico (continuam por sinônimos/fuzzy/IA).
- Match por EAN agora ignora ordem das palavras.
- EAN duplicado entre masters: continua bloqueando auto-vínculo (segue para IA, recomendação de revisão manual no log).

---

## Fase 1 — Backfill de EAN no catálogo master

**Função criada:** `supabase/functions/backfill-ean-master/index.ts` (master-only, dry_run por padrão).

**Lógica conservadora:**
- Para cada master ATIVO sem `codigo_barras`:
  - lê EANs de todos os itens em `estoque_app` já vinculados (`produto_master_id`);
  - exige no mínimo `min_items=3` itens com EAN válido;
  - exige concordância `>= min_agreement=0.8` no mesmo EAN canônico;
  - **NUNCA grava se o EAN canônico já existir em outro master ativo** (verifica todas as variantes).
- Grava sempre na forma canônica.

**Como executar (dry_run obrigatório primeiro):**
```bash
# Dry-run (não escreve nada, retorna relatório)
curl -X POST https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/backfill-ean-master \
  -H "Authorization: Bearer <JWT_MASTER>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'

# Aplicar (após revisar o relatório)
curl ... -d '{"dry_run": false}'
```

---

## Fase 3 — Vincular órfãos por EAN ⏳

**Função criada:** `supabase/functions/vincular-orfaos-por-ean/index.ts` (master-only, dry_run por padrão).

**Lógica:**
- Para cada item de `estoque_app` com `produto_master_id IS NULL` e `ean_comercial` válido:
  - busca master ATIVO por variantes do EAN canônico;
  - se match único → propaga `produto_master_id`, `sku_global`, `produto_nome` (= `nome_padrao`), `produto_nome_normalizado`, `nome_base`, `marca`, `categoria` (lowercase) e `imagem_url`;
  - se 0 ou >1 masters → pula (registra no log).

**Pré-requisito:** Fase 1 deve ter sido aplicada para maximizar a cobertura.

**Ordem de execução aprovada pelo usuário:**
1. Aplicar Fase 2 ✅
2. Rodar Fase 1 em dry_run → revisar → aplicar
3. Rodar Fase 3 em dry_run → revisar → aplicar

---

## Validação final esperada

- ✅ Match por EAN funciona mesmo com ordem de palavras diferente (Fase 2).
- 📈 Cobertura de EAN no catálogo: 354/780 (45%) → esperado >600 após Fase 1.
- 🎯 Órfãos com EAN existente: 3 → 0 após Fase 3.
- 🛡️ Os 7 grupos com EAN duplicado em masters distintos permanecem **sem auto-vínculo** (logados para revisão manual).
- 🟢 Itens sem EAN: fluxo idêntico (sem regressão).
