-- Consolidar os produtos IOGURTE LÍQUIDO/LIQUIDO LACFREE MORANGO
-- Primeiro, somar as quantidades e manter apenas um registro

-- Somar quantidade total dos dois produtos
UPDATE estoque_app 
SET quantidade = (
  SELECT SUM(quantidade) 
  FROM estoque_app e2 
  WHERE e2.user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
  AND (e2.produto_nome = 'IOGURTE LIQUIDO LACFREE MORANGO' 
       OR e2.produto_nome = 'IOGURTE LÍQUIDO LACFREE MORANGO')
),
produto_nome = 'IOGURTE LÍQUIDO LACFREE MORANGO',
updated_at = now()
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
AND produto_nome = 'IOGURTE LIQUIDO LACFREE MORANGO';

-- Remover o produto duplicado (sem acento)
DELETE FROM estoque_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
AND produto_nome = 'IOGURTE LÍQUIDO LACFREE MORANGO'
AND id != (
  SELECT id FROM estoque_app e2 
  WHERE e2.user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
  AND e2.produto_nome = 'IOGURTE LIQUIDO LACFREE MORANGO'
  LIMIT 1
);