-- 1. Normalizar nome_padrao do catálogo master para CAIXA ALTA
UPDATE produtos_master_global
SET nome_padrao = UPPER(TRIM(REGEXP_REPLACE(nome_padrao, '\s+', ' ', 'g')))
WHERE nome_padrao IS DISTINCT FROM UPPER(TRIM(REGEXP_REPLACE(nome_padrao, '\s+', ' ', 'g')));

-- 2. Re-alinhar itens da lista de compras com o nome_padrao corrigido
UPDATE listas_compras_itens i
SET produto_nome = p.nome_padrao
FROM produtos_master_global p
WHERE i.produto_id = p.id
  AND i.produto_nome IS DISTINCT FROM p.nome_padrao;