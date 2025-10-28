-- =====================================================
-- Corrigir foreign key constraint que impede exclusão de candidatos
-- =====================================================

-- A tabela normalizacao_decisoes_log tem uma foreign key para produtos_candidatos_normalizacao
-- que está bloqueando a exclusão. Como candidato_id é nullable, vamos usar ON DELETE SET NULL
-- para manter o histórico mas permitir a exclusão dos candidatos.

-- Remover constraint antiga
ALTER TABLE normalizacao_decisoes_log
DROP CONSTRAINT IF EXISTS normalizacao_decisoes_log_candidato_id_fkey;

-- Recriar constraint com ON DELETE SET NULL
ALTER TABLE normalizacao_decisoes_log
ADD CONSTRAINT normalizacao_decisoes_log_candidato_id_fkey
FOREIGN KEY (candidato_id) 
REFERENCES produtos_candidatos_normalizacao(id)
ON DELETE SET NULL;

-- Comentário para documentação
COMMENT ON CONSTRAINT normalizacao_decisoes_log_candidato_id_fkey 
ON normalizacao_decisoes_log IS 
'Foreign key para produtos_candidatos_normalizacao com ON DELETE SET NULL para manter histórico ao deletar candidatos';