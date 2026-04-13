

## Plano: Corrigir categorias desalinhadas no estoque

### Problema
7 registros no `estoque_app` estão com categoria diferente do seu `produtos_master_global` vinculado. São registros antigos que não foram alcançados pela propagação da recategorização.

A manteiga com sal que você mencionou é um desses casos — o master já está correto em LATICÍNIOS/FRIOS, mas o estoque ficou preso em "padaria".

### Correção

**Uma única migration SQL** que sincroniza a categoria do estoque com o master para todos os registros divergentes:

```sql
UPDATE estoque_app e
SET categoria = lower(m.categoria), updated_at = now()
FROM produtos_master_global m
WHERE e.produto_master_id = m.id
  AND lower(m.categoria) != e.categoria;
```

Isso corrige os 7 registros de uma vez:
- 3 manteigas: padaria → laticínios/frios
- 2 bebidas isotônicas: hortifruti → bebidas
- 2 gelatinas: hortifruti → mercearia

### O que NÃO muda
- Nenhuma Edge Function
- Nenhum componente frontend
- Nenhuma lógica de recategorização
- Apenas dados desalinhados são corrigidos

### Resultado
Após a correção, a manteiga com sal aparecerá em laticínios/frios no estoque, alinhada com o master.

