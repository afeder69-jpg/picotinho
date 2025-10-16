-- Adicionar coluna para armazenar parâmetros do comando
ALTER TABLE whatsapp_mensagens 
ADD COLUMN IF NOT EXISTS parametros_comando JSONB;

COMMENT ON COLUMN whatsapp_mensagens.parametros_comando IS 
  'Parâmetros extraídos do comando (ex: {titulo_lista: "Semana 1"})';