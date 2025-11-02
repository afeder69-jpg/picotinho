-- Tabela para rastrear mensagens do WhatsApp já processadas
CREATE TABLE IF NOT EXISTS whatsapp_mensagens_processadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  remetente text NOT NULL,
  processada_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para busca rápida por message_id
CREATE INDEX idx_whatsapp_msg_id ON whatsapp_mensagens_processadas(message_id);

-- Índice para limpeza por data
CREATE INDEX idx_whatsapp_msg_created ON whatsapp_mensagens_processadas(created_at);

-- RLS: apenas service role pode acessar
ALTER TABLE whatsapp_mensagens_processadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sistema pode gerenciar mensagens processadas"
ON whatsapp_mensagens_processadas
FOR ALL
TO service_role
USING (true);

-- Função para limpeza automática (opcional)
CREATE OR REPLACE FUNCTION limpar_mensagens_whatsapp_antigas()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_mensagens_processadas
  WHERE created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE whatsapp_mensagens_processadas IS 'Controle de deduplicação de mensagens WhatsApp para evitar processamento duplicado';
COMMENT ON FUNCTION limpar_mensagens_whatsapp_antigas() IS 'Remove registros de mensagens processadas com mais de 30 dias';