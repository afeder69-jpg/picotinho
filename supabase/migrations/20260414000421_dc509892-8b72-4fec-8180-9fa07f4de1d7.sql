-- Corrigir nomes dos itens de lista de compras para padrão CAIXA ALTA

-- 1. Itens vinculados a produto master: usar nome_padrao do master
UPDATE listas_compras_itens i
SET produto_nome = p.nome_padrao
FROM produtos_master_global p
WHERE i.produto_id = p.id
  AND i.produto_nome IS DISTINCT FROM p.nome_padrao;

-- 2. Itens livres ou sem vínculo: normalizar para CAIXA ALTA com trim e remoção de espaços duplicados
UPDATE listas_compras_itens
SET produto_nome = UPPER(TRIM(REGEXP_REPLACE(produto_nome, '\s+', ' ', 'g')))
WHERE produto_id IS NULL
  AND produto_nome IS NOT NULL
  AND TRIM(produto_nome) <> ''
  AND produto_nome IS DISTINCT FROM UPPER(TRIM(REGEXP_REPLACE(produto_nome, '\s+', ' ', 'g')));