

## Diagnóstico: Duplicatas exatas não detectadas

### Causa raiz confirmada

Consultei o banco e encontrei **23+ grupos** de produtos com `nome_padrao` e `marca` **idênticos** que não estão sendo detectados. Motivos:

1. **Filtro `total_notas >= 1`** (linha 47) — exclui produtos com 0 notas. Exemplo: os dois "FEIJAO PRETO MAXIMO 1KG" ambos têm `total_notas = 0`, então nenhum aparece na busca.
2. **Limite de 1000 produtos** — pode cortar produtos legítimos.
3. **Comparação por similaridade RPC** — desnecessária para produtos com nome exatamente igual. Desperdiça comparações e pode falhar por diferença de case ("CIF Multiuso" vs "Cif Multiuso").

### Dados reais encontrados (exemplos)

| Produto | Qtd duplicados | Notas |
|---------|---------------|-------|
| AÇÚCAR REFINADO UNIÃO 1KG | 3 | 2, 1, 0 |
| FEIJAO PRETO MAXIMO 1KG | 2 | 0, 0 |
| OVOS BRANCOS | 3 | 0, 0, 0 |
| LEITE UHT INTEGRAL ITALAC 1L | 2 | 21, 1 |
| GUARDANAPO KITCHEN 50 UN | 3 | 1, 1, 1 |
| CIF Multiuso 250ml (case diff) | 4 | 1, 0, 0, 0 |
| + ~17 outros grupos | ... | ... |

### Correção proposta

**Edge function `detectar-duplicatas-master/index.ts`** — adicionar uma **primeira passada de detecção exata** antes da comparação por similaridade:

1. **Buscar TODOS os masters ativos** (remover filtro `total_notas >= 1`, aumentar limit para 5000)
2. **Passada 1 — Duplicatas exatas**: Agrupar por `UPPER(nome_padrao) + UPPER(COALESCE(marca,''))`. Grupos com 2+ produtos são duplicatas imediatas (sem precisar de RPC). Também incluir agrupamento por `UPPER(nome_base) + UPPER(COALESCE(marca,''))` para pegar variações leves no nome_padrao.
3. **Passada 2 — Similaridade** (existente): Manter para pegar near-duplicates, mas excluir produtos já agrupados na passada 1.
4. **Case-insensitive**: Normalizar nomes com `UPPER()` para agrupar "CIF Multiuso" com "Cif Multiuso".
5. Manter verificação de pares ignorados em ambas as passadas.

### Escopo

- 1 arquivo: `supabase/functions/detectar-duplicatas-master/index.ts`
- Deploy da edge function
- Nenhuma migration necessária

