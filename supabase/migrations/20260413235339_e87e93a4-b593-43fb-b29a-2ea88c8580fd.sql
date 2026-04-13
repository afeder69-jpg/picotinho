-- Corrigir itens granel com subunidades técnicas (G→KG, ML→L)
UPDATE listas_compras_itens i
SET unidade_medida = 'KG'
FROM produtos_master_global p
WHERE i.produto_id = p.id
  AND p.granel = true
  AND UPPER(TRIM(i.unidade_medida)) = 'G';

UPDATE listas_compras_itens i
SET unidade_medida = 'L'
FROM produtos_master_global p
WHERE i.produto_id = p.id
  AND p.granel = true
  AND UPPER(TRIM(i.unidade_medida)) = 'ML';