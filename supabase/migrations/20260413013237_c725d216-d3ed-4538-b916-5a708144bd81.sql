-- Passo 1: Corrigir typo na keyword da regra
UPDATE regras_recategorizacao 
SET keywords = ARRAY['enxaguante bucal'],
    updated_at = now()
WHERE id = 'acb709ef-08e2-4bba-9bca-f06d2776422c';

-- Passo 2: Corrigir itens órfãos no estoque (sem produto_master_id)
UPDATE estoque_app
SET categoria = 'higiene/farmácia', updated_at = now()
WHERE produto_master_id IS NULL
  AND lower(produto_nome) LIKE '%enxaguante bucal%'
  AND categoria != 'higiene/farmácia';