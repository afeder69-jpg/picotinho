-- Adicionar coluna origem na tabela notas_imagens se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'notas_imagens' 
                   AND column_name = 'origem') THEN
        ALTER TABLE notas_imagens 
        ADD COLUMN origem VARCHAR(50) DEFAULT 'app';
        
        COMMENT ON COLUMN notas_imagens.origem IS 'Origem da nota fiscal (app, whatsapp, email, etc.)';
    END IF;
END $$;