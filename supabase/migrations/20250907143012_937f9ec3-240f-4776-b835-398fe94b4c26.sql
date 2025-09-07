-- Adicionar constraint única para chaves de acesso em compras_app
-- Isso evitará duplicatas de notas fiscais baseado na chave de acesso

-- Primeiro, limpar possíveis duplicatas existentes (manter apenas a mais recente)
WITH duplicadas AS (
  SELECT 
    chave_acesso, 
    MIN(id) as id_manter
  FROM compras_app 
  WHERE chave_acesso IS NOT NULL 
    AND chave_acesso != ''
    AND LENGTH(chave_acesso) = 44
  GROUP BY chave_acesso
  HAVING COUNT(*) > 1
)
DELETE FROM compras_app 
WHERE chave_acesso IN (SELECT chave_acesso FROM duplicadas)
  AND id NOT IN (SELECT id_manter FROM duplicadas);

-- Adicionar constraint única para chave de acesso
ALTER TABLE compras_app 
ADD CONSTRAINT unique_chave_acesso 
UNIQUE (chave_acesso) 
DEFERRABLE INITIALLY DEFERRED;

-- Comentário explicativo
COMMENT ON CONSTRAINT unique_chave_acesso ON compras_app 
IS 'Impede cadastro de notas fiscais duplicadas baseado na chave de acesso de 44 dígitos';