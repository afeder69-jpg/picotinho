
-- Tabela de preferências do usuário para o assistente WhatsApp
CREATE TABLE public.whatsapp_preferencias_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_preferido TEXT,
  estilo_conversa TEXT DEFAULT 'natural',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id)
);

ALTER TABLE public.whatsapp_preferencias_usuario ENABLE ROW LEVEL SECURITY;

-- Policies separadas por operação com WITH CHECK
CREATE POLICY "Service role pode ler preferencias"
  ON public.whatsapp_preferencias_usuario FOR SELECT
  USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role pode inserir preferencias"
  ON public.whatsapp_preferencias_usuario FOR INSERT
  WITH CHECK (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role pode atualizar preferencias"
  ON public.whatsapp_preferencias_usuario FOR UPDATE
  USING (current_setting('role', true) = 'service_role')
  WITH CHECK (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role pode deletar preferencias"
  ON public.whatsapp_preferencias_usuario FOR DELETE
  USING (current_setting('role', true) = 'service_role');

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.update_whatsapp_preferencias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_whatsapp_preferencias_updated_at
  BEFORE UPDATE ON public.whatsapp_preferencias_usuario
  FOR EACH ROW
  EXECUTE FUNCTION public.update_whatsapp_preferencias_updated_at();
