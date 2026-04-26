-- 1) Adicionar preferência de notificação no telefone autorizado
ALTER TABLE public.whatsapp_telefones_autorizados
ADD COLUMN IF NOT EXISTS pref_resumo_notas boolean NOT NULL DEFAULT true;

-- 2) Criar tabela de logs de notificações
CREATE TABLE IF NOT EXISTS public.notificacoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id uuid NOT NULL,
  user_id uuid NOT NULL,
  canal text NOT NULL DEFAULT 'whatsapp',
  tipo text NOT NULL,
  telefone text,
  status text NOT NULL,
  erro text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificacoes_log_canal_check CHECK (canal IN ('whatsapp')),
  CONSTRAINT notificacoes_log_tipo_check CHECK (tipo IN ('resumo_nota_processada', 'falha_processamento_nota')),
  CONSTRAINT notificacoes_log_status_check CHECK (status IN ('enviado', 'falhou', 'pulado'))
);

-- Idempotência: apenas uma notificação por (nota, canal, tipo)
CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_log_unique_nota_canal_tipo
ON public.notificacoes_log (nota_id, canal, tipo);

CREATE INDEX IF NOT EXISTS notificacoes_log_user_id_idx ON public.notificacoes_log (user_id);
CREATE INDEX IF NOT EXISTS notificacoes_log_nota_id_idx ON public.notificacoes_log (nota_id);

-- 3) RLS
ALTER TABLE public.notificacoes_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification logs"
ON public.notificacoes_log
FOR SELECT
USING (auth.uid() = user_id);

-- Insert/update somente via service role (edge function). Sem policies para anon/authenticated.
