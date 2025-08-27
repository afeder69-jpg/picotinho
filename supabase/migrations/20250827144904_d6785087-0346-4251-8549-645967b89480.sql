-- Adicionar coluna nome_original na tabela notas_imagens se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'notas_imagens' 
        AND column_name = 'nome_original'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.notas_imagens 
        ADD COLUMN nome_original TEXT;
        
        COMMENT ON COLUMN public.notas_imagens.nome_original IS 'Nome original do arquivo antes da normalização';
    END IF;
END $$;