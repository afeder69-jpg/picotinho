-- Adicionar constraint de unicidade para prevenir duplicatas
-- Prioriza CNPJ quando disponível, senão usa nome_original + nome_normalizado

-- Primeiro, limpar duplicatas existentes mantendo a mais antiga de cada grupo
WITH duplicatas_cnpj AS (
  SELECT 
    cnpj_original,
    nome_normalizado,
    MIN(created_at) as primeira_criacao
  FROM normalizacoes_estabelecimentos
  WHERE cnpj_original IS NOT NULL
  AND ativo = true
  GROUP BY cnpj_original, nome_normalizado
  HAVING COUNT(*) > 1
),
duplicatas_nome AS (
  SELECT 
    nome_original,
    nome_normalizado,
    MIN(created_at) as primeira_criacao
  FROM normalizacoes_estabelecimentos
  WHERE cnpj_original IS NULL
  AND ativo = true
  GROUP BY nome_original, nome_normalizado
  HAVING COUNT(*) > 1
)
-- Desativar duplicatas (mantendo apenas a mais antiga)
UPDATE normalizacoes_estabelecimentos ne
SET ativo = false, updated_at = now()
WHERE (
  -- Duplicatas por CNPJ
  (ne.cnpj_original IS NOT NULL 
   AND EXISTS (
     SELECT 1 FROM duplicatas_cnpj d
     WHERE d.cnpj_original = ne.cnpj_original
     AND d.nome_normalizado = ne.nome_normalizado
     AND ne.created_at > d.primeira_criacao
   ))
  OR
  -- Duplicatas por nome
  (ne.cnpj_original IS NULL 
   AND EXISTS (
     SELECT 1 FROM duplicatas_nome d
     WHERE d.nome_original = ne.nome_original
     AND d.nome_normalizado = ne.nome_normalizado
     AND ne.created_at > d.primeira_criacao
   ))
);

-- Criar constraint única composta
-- Se CNPJ existe, usa (cnpj_original, nome_normalizado)
-- Se CNPJ não existe, usa (nome_original, nome_normalizado)
-- Usando COALESCE para criar um identificador único
CREATE UNIQUE INDEX idx_normalizacoes_estabelecimentos_unique 
ON normalizacoes_estabelecimentos (
  COALESCE(cnpj_original, ''), 
  nome_original,
  nome_normalizado
) WHERE ativo = true;

-- Comentário explicativo
COMMENT ON INDEX idx_normalizacoes_estabelecimentos_unique IS 
'Previne duplicatas: prioriza CNPJ quando disponível, senão usa nome_original. Considera apenas registros ativos.';