

## Análise: "Buscar e Consolidar Duplicatas" na Normalização Global Master

### Status geral

O fluxo envolve 3 funções e a UI:
1. **`detectar-duplicatas-master`** — detecção (passada 1: exata por nome_padrao/nome_base; passada 2: similaridade via RPC `comparar_masters_similares`) — **OK, sem problemas**
2. **`consolidar-masters-manual`** — consolidação individual/em lote pela UI — **BUG ENCONTRADO**
3. **`consolidar-masters-duplicados`** — consolidação automática (não usada pela UI, é standalone) — **OK**
4. **UI em `NormalizacaoGlobal.tsx`** — botão "Buscar e Consolidar duplicatas" → modal com grupos → consolidação individual/em lote — **OK**

### Bug encontrado

**Arquivo**: `supabase/functions/consolidar-masters-manual/index.ts`, linha 82

```typescript
// ERRADO — coluna "origem" não existe na tabela
.insert({
  produto_master_id: produtoMantido.id,
  texto_variacao: produtoRemover.sku_global,
  confianca: 1.0,
  total_ocorrencias: produtoRemover.total_notas || 1,
  origem: 'consolidacao_manual'  // ← BUG: a coluna se chama "fonte"
})
```

A tabela `produtos_sinonimos_globais` tem a coluna `fonte` (não `origem`). Esse insert pode falhar silenciosamente ou com erro, impedindo que sinônimos sejam criados durante a consolidação manual. Os masters são deletados mas os sinônimos não ficam registrados, o que pode causar re-fragmentação futura.

A função `consolidar-masters-duplicados` (automática) usa `fonte` corretamente na linha 144.

### Plano de correção

**Arquivo**: `supabase/functions/consolidar-masters-manual/index.ts`

1. Linha 82: trocar `origem: 'consolidacao_manual'` para `fonte: 'consolidacao_manual'`
2. Adicionar `aprovado_em: new Date().toISOString()` para marcar o sinônimo como aprovado (necessário para a Estratégia 0.5 que filtra por `aprovado_em IS NOT NULL`)
3. Deploy da função

Essa é a única correção necessária. O resto do fluxo (detecção, UI, consolidação automática) está correto e não foi afetado pelas alterações estruturais anteriores.

### Escopo

- 1 arquivo: `supabase/functions/consolidar-masters-manual/index.ts`
- Sem migração SQL
- Sem mudança de frontend

