

## Plano: Corrigir recategorização do Listerine e itens órfãos

### Diagnóstico

Três problemas combinados impediram a recategorização:

1. **Typo na regra**: A keyword cadastrada é `"Enxaguando bucal"` — deveria ser `"Enxaguante bucal"`. Por isso a regra nunca casa com nenhum produto.

2. **Produto sem master**: O item "Enxaguante bucal listerine melancia e hortelã" no estoque está com `produto_master_id = NULL`. A recategorização inteligente só atua em `produtos_master_global` e propaga via vínculo — itens órfãos ficam invisíveis.

3. **Lacuna arquitetural**: A recategorização inteligente ignora completamente itens do `estoque_app` sem vínculo ao master. Isso significa que qualquer produto que entrou sem normalização fica preso na categoria original para sempre.

### Correção (3 passos)

**Passo 1 — Corrigir o typo na regra (migration SQL)**
```sql
UPDATE regras_recategorizacao 
SET keywords = ARRAY['enxaguante bucal']
WHERE id = 'acb709ef-08e2-4bba-9bca-f06d2776422c';
```

**Passo 2 — Corrigir itens órfãos no estoque via migration SQL**

Aplicar as regras de recategorização diretamente nos itens do `estoque_app` que não têm `produto_master_id`, usando a mesma lógica de match por tokens. Para o caso imediato:

```sql
UPDATE estoque_app
SET categoria = 'higiene/farmácia', updated_at = now()
WHERE produto_master_id IS NULL
  AND lower(produto_nome) LIKE '%enxaguante bucal%'
  AND categoria != 'higiene/farmácia';
```

**Passo 3 — Adicionar lógica de fallback na edge function `recategorizar-produtos-inteligente`**

Após processar os masters, adicionar uma segunda passagem que aplica as regras ativas diretamente nos itens do `estoque_app` que não têm `produto_master_id`. Isso garante que itens órfãos também sejam recategorizados para todos os usuários, usando a mesma lógica de match por tokens e a mesma hierarquia de prioridade.

### O que NÃO muda
- Nenhum componente frontend
- Lógica de match por tokens (mantida igual)
- Hierarquia de prioridade de regras (mantida igual)
- Propagação master → estoque para itens vinculados (mantida igual)

### Resultado esperado
- O typo na regra será corrigido
- O Listerine de melancia (e qualquer outro enxaguante bucal órfão) será movido para HIGIENE/FARMÁCIA
- Futuras recategorizações cobrirão itens sem master automaticamente

