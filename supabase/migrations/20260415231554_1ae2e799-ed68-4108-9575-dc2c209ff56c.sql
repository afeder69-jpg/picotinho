-- 1. Resolver a duplicata existente (manter o mais antigo, marcar o mais recente como excluída)
UPDATE notas_imagens
SET excluida = true
WHERE id = '327765d7-7ddd-427d-82e0-0ead7d3d4e47';

-- 2. Criar coluna dedicada
ALTER TABLE notas_imagens ADD COLUMN IF NOT EXISTS chave_acesso TEXT;

-- 3. Backfill a partir do JSONB
UPDATE notas_imagens 
SET chave_acesso = dados_extraidos->>'chave_acesso'
WHERE dados_extraidos->>'chave_acesso' IS NOT NULL
  AND chave_acesso IS NULL;

-- 4. Índice único parcial: chave bloqueada apenas enquanto nota ativa
CREATE UNIQUE INDEX IF NOT EXISTS idx_notas_imagens_chave_acesso_unique 
ON notas_imagens (chave_acesso) 
WHERE chave_acesso IS NOT NULL AND excluida IS NOT TRUE;