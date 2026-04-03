
-- Enums para o sistema de feedbacks
CREATE TYPE public.feedback_tipo AS ENUM ('erro', 'sugestao', 'reclamacao', 'duvida');
CREATE TYPE public.feedback_status AS ENUM ('novo', 'em_analise', 'respondido', 'resolvido');
CREATE TYPE public.feedback_prioridade AS ENUM ('baixa', 'normal', 'alta', 'urgente');

-- Tabela principal de feedbacks
CREATE TABLE public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  telefone_whatsapp TEXT,
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  session_id TEXT,
  tipo feedback_tipo NOT NULL,
  mensagem TEXT NOT NULL,
  contexto TEXT,
  status feedback_status NOT NULL DEFAULT 'novo',
  prioridade feedback_prioridade NOT NULL DEFAULT 'normal',
  atribuido_a UUID,
  atribuido_por UUID,
  atribuido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de respostas/histórico de interações
CREATE TABLE public.feedbacks_respostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES public.feedbacks(id) ON DELETE CASCADE,
  autor_id UUID,
  autor_tipo TEXT NOT NULL DEFAULT 'admin' CHECK (autor_tipo IN ('admin', 'master', 'sistema', 'ia', 'atendente')),
  mensagem TEXT NOT NULL,
  enviada_via_whatsapp BOOLEAN NOT NULL DEFAULT false,
  envio_whatsapp_status TEXT CHECK (envio_whatsapp_status IN ('pendente', 'enviado', 'falha')),
  envio_whatsapp_erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at em feedbacks
CREATE OR REPLACE FUNCTION public.update_feedbacks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_feedbacks_updated_at
  BEFORE UPDATE ON public.feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feedbacks_updated_at();

-- RLS
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks_respostas ENABLE ROW LEVEL SECURITY;

-- Masters podem ver todos os feedbacks
CREATE POLICY "Masters podem ver feedbacks"
  ON public.feedbacks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

-- Masters podem atualizar feedbacks
CREATE POLICY "Masters podem atualizar feedbacks"
  ON public.feedbacks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

-- Service role pode inserir feedbacks (via edge function)
CREATE POLICY "Service role pode inserir feedbacks"
  ON public.feedbacks FOR INSERT
  WITH CHECK (true);

-- Masters podem ver respostas
CREATE POLICY "Masters podem ver respostas"
  ON public.feedbacks_respostas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

-- Masters podem inserir respostas
CREATE POLICY "Masters podem inserir respostas"
  ON public.feedbacks_respostas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- Service role pode inserir respostas (para IA/sistema)
CREATE POLICY "Service role pode inserir respostas automaticas"
  ON public.feedbacks_respostas FOR INSERT
  WITH CHECK (true);

-- Índices
CREATE INDEX idx_feedbacks_status ON public.feedbacks(status);
CREATE INDEX idx_feedbacks_tipo ON public.feedbacks(tipo);
CREATE INDEX idx_feedbacks_user_id ON public.feedbacks(user_id);
CREATE INDEX idx_feedbacks_created_at ON public.feedbacks(created_at DESC);
CREATE INDEX idx_feedbacks_respostas_feedback_id ON public.feedbacks_respostas(feedback_id);
