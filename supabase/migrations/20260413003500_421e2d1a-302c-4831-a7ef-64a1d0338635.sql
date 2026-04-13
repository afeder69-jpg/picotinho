UPDATE estoque_app e
SET categoria = lower(m.categoria), updated_at = now()
FROM produtos_master_global m
WHERE e.produto_master_id = m.id
  AND lower(m.categoria) != e.categoria;