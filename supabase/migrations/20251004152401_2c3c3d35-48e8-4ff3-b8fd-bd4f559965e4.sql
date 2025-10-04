-- Adicionar campo codigo_barras à tabela produtos_master_global
ALTER TABLE produtos_master_global 
ADD COLUMN IF NOT EXISTS codigo_barras TEXT;

-- Criar índice para busca eficiente por código de barras
CREATE INDEX IF NOT EXISTS idx_produtos_master_codigo_barras 
ON produtos_master_global(codigo_barras);