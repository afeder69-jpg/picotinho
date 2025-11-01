-- Adicionar coluna para lock de processamento
ALTER TABLE notas_imagens 
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- Criar índice para melhorar performance das queries de lock
CREATE INDEX IF NOT EXISTS idx_notas_imagens_processing_started_at 
ON notas_imagens(processing_started_at) 
WHERE processing_started_at IS NOT NULL;