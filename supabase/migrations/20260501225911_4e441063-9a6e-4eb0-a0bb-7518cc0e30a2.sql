CREATE TABLE public.notificacoes_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  nota_id uuid,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotência: 1 notificação por (nota, tipo)
CREATE UNIQUE INDEX uniq_notificacao_nota_tipo
  ON public.notificacoes_usuario (nota_id, tipo)
  WHERE nota_id IS NOT NULL;

CREATE INDEX idx_notificacoes_usuario_user_lida
  ON public.notificacoes_usuario (usuario_id, lida, created_at DESC);

ALTER TABLE public.notificacoes_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_notificacoes"
  ON public.notificacoes_usuario FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "update_own_notificacoes"
  ON public.notificacoes_usuario FOR UPDATE
  USING (auth.uid() = usuario_id);

ALTER TABLE public.notificacoes_usuario REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes_usuario;