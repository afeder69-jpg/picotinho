ALTER TABLE whatsapp_preferencias_usuario 
ADD COLUMN IF NOT EXISTS modo_resposta TEXT NOT NULL DEFAULT 'texto'
CHECK (modo_resposta IN ('texto', 'audio', 'ambos'));