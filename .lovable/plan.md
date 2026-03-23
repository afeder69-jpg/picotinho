

## Correção: Categorias inválidas no catálogo master e na interface

### Parte 1: Interface (SeletorProdutoNormalizado.tsx)

Importar `normalizarCategoria` e aplicar no Badge de categoria:

```tsx
import { normalizarCategoria } from "@/lib/categorias";
// ...
<Badge variant="secondary">{normalizarCategoria(produto.categoria)}</Badge>
```

### Parte 2: Correção de dados (SQL via insert tool)

**Etapa A — Casos inequívocos (case/acentuação):**

```sql
UPDATE produtos_master_global SET categoria = 'HIGIENE/FARMÁCIA' WHERE categoria = 'HIGIENE' AND status = 'ativo';
UPDATE produtos_master_global SET categoria = 'AÇOUGUE' WHERE categoria = 'ACOUGUE' AND status = 'ativo';
UPDATE produtos_master_global SET categoria = 'MERCEARIA' WHERE LOWER(categoria) = 'mercearia' AND categoria != 'MERCEARIA' AND status = 'ativo';
UPDATE produtos_master_global SET categoria = 'HORTIFRUTI' WHERE LOWER(categoria) = 'hortifruti' AND categoria != 'HORTIFRUTI' AND status = 'ativo';
UPDATE produtos_master_global SET categoria = 'OUTROS' WHERE LOWER(categoria) = 'outros' AND categoria != 'OUTROS' AND status = 'ativo';
UPDATE produtos_master_global SET categoria = 'BEBIDAS' WHERE LOWER(categoria) = 'bebidas' AND categoria != 'BEBIDAS' AND status = 'ativo';
```

**Etapa B — ALIMENTOS → LATICÍNIOS/FRIOS (14 produtos confirmados):**

Iogurtes, manteigas, margarinas, queijos e requeijões. Critério: `nome_base ILIKE` com exclusão de falsos positivos (ex: AMANTEIGADO).

```sql
UPDATE produtos_master_global SET categoria = 'LATICÍNIOS/FRIOS'
WHERE categoria = 'ALIMENTOS' AND status = 'ativo'
AND (
  nome_base ILIKE '%IOGURTE%' OR nome_base ILIKE '%IOG.%'
  OR nome_base ILIKE '%QUEIJO%'
  OR nome_base ILIKE '%REQUEIJÃO%' OR nome_base ILIKE '%REQUEIJAO%'
  OR (nome_base ILIKE '%MANTEIGA%' AND nome_base NOT ILIKE '%AMANTEIGAD%')
  OR nome_base ILIKE '%MARGARINA%'
);
```

**Etapa C — ALIMENTOS restantes → MERCEARIA:**

```sql
UPDATE produtos_master_global SET categoria = 'MERCEARIA'
WHERE categoria = 'ALIMENTOS' AND status = 'ativo';
```

### Conferência da amostra LATICÍNIOS/FRIOS

A consulta ao banco identificou 15 candidatos. Um falso positivo foi detectado e excluído:

| Produto | Destino | Motivo |
|---------|---------|--------|
| IOGURTE DESNATADO S/ LACTOSE... | LATICÍNIOS/FRIOS | Iogurte |
| IOGURTE INTEGRAL NESTLÉ | LATICÍNIOS/FRIOS | Iogurte |
| IOGURTE PARC. DESNATADO NATURAL... | LATICÍNIOS/FRIOS | Iogurte |
| IOGURTE PARC. DESNATADO MORANGO... | LATICÍNIOS/FRIOS | Iogurte |
| MANTEIGA COM SAL KREMINAS 500G | LATICÍNIOS/FRIOS | Manteiga |
| MARGARINA COM SAL E CREME DE LEITE... | LATICÍNIOS/FRIOS | Margarina |
| MARGARINA COM SAL QUALY 500G | LATICÍNIOS/FRIOS | Margarina |
| MARGARINA COM SAL SADIA 500G | LATICÍNIOS/FRIOS | Margarina |
| MARGARINA ORIGINAL COM SAL BECEL... | LATICÍNIOS/FRIOS | Margarina |
| QUEIJO PARMESÃO RALADO PRESIDENT 100G | LATICÍNIOS/FRIOS | Queijo |
| QUEIJO RALADO PARMESÃO PRESIDENT 50G | LATICÍNIOS/FRIOS | Queijo |
| REQUEIJÃO CREMOSO TRAD. CATUPIRY | LATICÍNIOS/FRIOS | Requeijão |
| REQUEIJÃO CREMOSO TRAD. TIROLEZ 200G | LATICÍNIOS/FRIOS | Requeijão |
| REQUEIJÃO VIGOR 200G | LATICÍNIOS/FRIOS | Requeijão |
| **BISCOITO CREAM CRACKER AMANTEIGADO** | **MERCEARIA** | Falso positivo excluído pelo filtro `NOT ILIKE '%AMANTEIGAD%'` |

### Resultado

- Zero categorias inválidas no catálogo master
- Interface resiliente via `normalizarCategoria()` no badge
- 14 produtos corretamente em LATICÍNIOS/FRIOS, 68 em MERCEARIA
- 10 produtos com case/acentuação corrigidos

