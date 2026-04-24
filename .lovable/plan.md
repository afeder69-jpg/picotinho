

# Ordenar notas do mesmo dia também por hora

## Problema

Em "Minhas Notas Fiscais", a ordenação está correta por **dia**, mas quando há duas ou mais notas no mesmo dia elas aparecem em ordem indefinida. Causa: o sort em `src/components/ReceiptList.tsx` (linha 457-463) faz `dateStr.split(' ')[0]` antes de converter a data, descartando a hora. Resultado: todas as notas do mesmo dia viram `00:00:00` e o `sort` perde a ordem entre elas.

A hora **já existe** nos dados (ex.: `compra.data_emissao = "22/04/2026 18:34:12"`), só não está sendo usada na comparação.

## Correção (cirúrgica, 1 arquivo)

**Arquivo**: `src/components/ReceiptList.tsx`, função de sort em `getCompraDate` (≈ linhas 435-475).

Ajuste mínimo no `formatDate`:

- Detectar se a string tem hora (após o espaço).
- Se for `DD/MM/YYYY HH:MM:SS` → converter para `YYYY-MM-DDTHH:MM:SS`.
- Se for só `DD/MM/YYYY` → manter o comportamento atual (`YYYY-MM-DD`).
- Manter o fallback para `created_at` (que é `timestamptz` e já tem hora) como desempate final quando a data extraída não tem hora.

Tiebreaker adicional: quando `timestampA === timestampB` (mesma data sem hora disponível em ambos), usar `new Date(a.created_at).getTime()` vs `b.created_at` como critério secundário, mantendo decrescente.

## O que NÃO será mexido

- Query do Supabase (já vem ordenada por `created_at desc`).
- Nenhum outro componente, página ou edge function.
- Formato de exibição da data/hora na UI.
- Lógica de extração de `data_emissao` ou outros campos.

## Validação esperada

- Notas de dias diferentes continuam ordenadas da mais recente para a mais antiga (sem regressão).
- Notas do mesmo dia passam a aparecer da mais recente para a mais antiga **pela hora**.
- Notas sem hora extraída continuam ordenadas pelo `created_at` como desempate, sem quebrar.

