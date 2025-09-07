-- Adicionar controle de duplicidade para chaves de acesso
-- Limpar duplicatas existentes mantendo a mais recente por chave de acesso

WITH duplicadas AS (
  SELECT 
    chave_acesso,
    array_agg(id ORDER BY created_at DESC) as ids_ordenados
  FROM compras_app 
  WHERE chave_acesso IS NOT NULL 
    AND chave_acesso != ''
    AND LENGTH(chave_acesso) = 44
  GROUP BY chave_acesso
  HAVING COUNT(*) > 1
)
DELETE FROM compras_app 
WHERE id IN (
  SELECT unnest(ids_ordenados[2:]) 
  FROM duplicadas
);

-- Agora criar constraint única para chave de acesso (permitindo NULLs)
-- Usando partial unique index para permitir múltiplos NULLs mas chaves únicas quando preenchidas
CREATE UNIQUE INDEX unique_chave_acesso_idx 
ON compras_app (chave_acesso) 
WHERE chave_acesso IS NOT NULL 
  AND chave_acesso != '' 
  AND LENGTH(chave_acesso) = 44;