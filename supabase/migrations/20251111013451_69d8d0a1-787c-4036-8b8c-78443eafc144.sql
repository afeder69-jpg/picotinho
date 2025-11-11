-- Adicionar coluna status_aprovacao na tabela notas_imagens
ALTER TABLE notas_imagens 
ADD COLUMN IF NOT EXISTS status_aprovacao TEXT 
DEFAULT NULL 
CHECK (status_aprovacao IN (NULL, 'pendente_aprovacao', 'aprovada', 'cancelada'));

-- Criar índice para performance do polling
CREATE INDEX IF NOT EXISTS idx_notas_status_aprovacao 
ON notas_imagens(usuario_id, status_aprovacao) 
WHERE status_aprovacao = 'pendente_aprovacao';

COMMENT ON COLUMN notas_imagens.status_aprovacao IS 
'NULL = ainda processando | pendente_aprovacao = pronta para usuário aprovar | aprovada = confirmada | cancelada = rejeitada';