

# Ajustar parser de data para cobrir todos os formatos já existentes

## Problema confirmado

A correção anterior só cobriu o formato `DD/MM/YYYY HH:MM:SS`. Mas as notas já lançadas no banco têm **três formatos diferentes** em `dados_extraidos.compra.data_emissao`:

1. `2026-04-22T08:57:18` — ISO sem barra (já funciona, `new Date()` parseia direto).
2. `22/04/2026 10:52:29-03:00` — BR com timezone colado (**quebra**: a regex de hora não aceita `-03:00` no final, então a hora é descartada).
3. `DD/MM/YYYY` puro — sem hora alguma (cai no tiebreaker por `created_at`, que é a data de upload e não a da compra).

Resultado: notas do mesmo dia em formato 2 ou 3 continuam aparecendo fora de ordem por hora.

## Correção (cirúrgica, mesmo arquivo)

**Arquivo**: `src/components/ReceiptList.tsx`, função `formatDate` dentro do sort (≈ linhas 457-469).

Ajustes mínimos:

- **Formato 1 (ISO `YYYY-MM-DDTHH:MM:SS`)**: já funciona, manter.
- **Formato 2 (`DD/MM/YYYY HH:MM:SS[±HH:MM]`)**: ampliar a regex para aceitar timezone opcional (`-03:00`, `+00:00`, `Z`) e preservá-lo no resultado convertido — `YYYY-MM-DDTHH:MM:SS-03:00` é parseável pelo `new Date()`.
- **Formato 3 (`DD/MM/YYYY` sem hora)**: como fallback, tentar extrair a hora também do `created_at` da própria nota só para fins de desempate **dentro do mesmo dia** — mas só quando a data da compra (dia) bater com a data do `created_at`. Se não bater (ex.: nota emitida ontem, subida hoje), manter `00:00:00` e deixar o tiebreaker decidir.

Tiebreaker final por `created_at` permanece como está.

## O que NÃO será mexido

- Query do Supabase.
- Estrutura dos dados em `dados_extraidos`.
- Nenhum outro componente, edge function ou exibição na UI.
- Notas que já estão em ordem correta (formato 1) continuam idênticas.

## Validação esperada

- Notas com `DD/MM/YYYY HH:MM:SS-03:00` passam a ser ordenadas pela hora real da compra.
- Notas só com `DD/MM/YYYY` (sem hora) usam `created_at` apenas quando o dia bate, evitando "falsa hora" de notas emitidas em outro dia.
- Notas em formato ISO continuam ordenadas como hoje.
- Sem regressão na ordenação entre dias diferentes.

