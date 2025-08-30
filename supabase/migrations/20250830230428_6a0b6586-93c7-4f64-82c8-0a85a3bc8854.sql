-- Adicionar campos de verificação à tabela whatsapp_configuracoes
ALTER TABLE whatsapp_configuracoes 
ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS codigo_verificacao VARCHAR(6),
ADD COLUMN IF NOT EXISTS data_codigo TIMESTAMP WITH TIME ZONE;