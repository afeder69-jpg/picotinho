-- Adicionar coluna anexo_info na tabela whatsapp_mensagens se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'whatsapp_mensagens' 
                   AND column_name = 'anexo_info') THEN
        ALTER TABLE whatsapp_mensagens 
        ADD COLUMN anexo_info JSONB;
        
        COMMENT ON COLUMN whatsapp_mensagens.anexo_info IS 'Informações sobre anexos enviados via WhatsApp (documentos, imagens, etc.)';
    END IF;
END $$;