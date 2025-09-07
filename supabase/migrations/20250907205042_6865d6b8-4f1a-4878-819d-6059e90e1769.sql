-- Corrigir manualmente os preços dos produtos problemáticos
UPDATE estoque_app 
SET preco_unitario_ultimo = 3.99, updated_at = now()
WHERE produto_nome ILIKE '%ALFACE%AMERICANA%'
AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);

UPDATE estoque_app 
SET preco_unitario_ultimo = 0.09, updated_at = now()
WHERE produto_nome ILIKE '%SACOLA%PLASTICA%'
AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);

UPDATE estoque_app 
SET preco_unitario_ultimo = 3.19, updated_at = now()
WHERE produto_nome ILIKE '%RUCULA%'
AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);