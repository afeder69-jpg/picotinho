

## Correção: inativar o registro correto de SUPERDELLI

### Diagnóstico

A migração anterior usou o UUID `334e4cde-4029-4e68-b951-7f72b2f57cd3`, mas o ID real do registro é `334e4cde-ab2d-4c3a-a9dc-4356cfd38fe3`. O UPDATE executou sem erro mas afetou zero linhas — o registro SUPERDELLI sem CNPJ continua ativo.

### Correção

Executar um UPDATE com o ID correto para inativar o registro:

```sql
UPDATE public.normalizacoes_estabelecimentos
SET ativo = false, updated_at = now()
WHERE id = '334e4cde-ab2d-4c3a-a9dc-4356cfd38fe3'
  AND ativo = true
  AND cnpj_original IS NULL;
```

Isso é uma operação de dados (não schema), então será feita via ferramenta de insert/update, sem necessidade de migração.

### Resultado esperado

- O registro "SUPERDELLI ATACADÃO SUPERMERCADO → SUPERDELLI" desaparece da listagem ativa
- Apenas "SUPERDELLI ATACADO E SUPERMERCADOS SA → MEGABOX RECREIO" (com CNPJ) permanece ativo

