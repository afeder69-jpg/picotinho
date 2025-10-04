-- Adicionar coluna de controle de normalização em notas_imagens
ALTER TABLE notas_imagens 
ADD COLUMN IF NOT EXISTS normalizada BOOLEAN DEFAULT false;

-- Criar índice para otimizar queries de notas não normalizadas
CREATE INDEX IF NOT EXISTS idx_notas_para_normalizar 
ON notas_imagens(usuario_id, processada, normalizada) 
WHERE processada = true AND normalizada = false;

-- Adicionar constraint UNIQUE em codigo_barras do Open Food Facts
-- Usando DO $$ para verificar se já existe antes de criar
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_codigo_barras'
    ) THEN
        ALTER TABLE open_food_facts_staging 
        ADD CONSTRAINT unique_codigo_barras UNIQUE (codigo_barras);
    END IF;
END $$;

-- Comentários explicativos
COMMENT ON COLUMN notas_imagens.normalizada IS 'Indica se os produtos desta nota já foram normalizados pela IA-2';
COMMENT ON INDEX idx_notas_para_normalizar IS 'Índice para otimizar busca de notas pendentes de normalização';