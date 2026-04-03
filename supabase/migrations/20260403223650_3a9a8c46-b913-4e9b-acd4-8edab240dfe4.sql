
-- Função genérica para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Tabela principal de campanhas
CREATE TABLE public.campanhas_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  filtro_tipo text NOT NULL DEFAULT 'todos',
  filtro_valor text,
  total_destinatarios integer NOT NULL DEFAULT 0,
  total_enviados integer NOT NULL DEFAULT 0,
  total_falhas integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho',
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campanhas_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem gerenciar campanhas"
  ON public.campanhas_whatsapp FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

CREATE TRIGGER trg_updated_at_campanhas_whatsapp
  BEFORE UPDATE ON public.campanhas_whatsapp
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 2) Log de envios por destinatário
CREATE TABLE public.campanhas_whatsapp_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas_whatsapp(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  telefone text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campanha_id, user_id)
);

ALTER TABLE public.campanhas_whatsapp_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem ver envios de campanhas"
  ON public.campanhas_whatsapp_envios FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

CREATE INDEX idx_campanhas_envios_campanha ON public.campanhas_whatsapp_envios(campanha_id);
CREATE INDEX idx_campanhas_envios_status ON public.campanhas_whatsapp_envios(campanha_id, status);

-- 3) Tabela preparada para respostas futuras
CREATE TABLE public.campanhas_whatsapp_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas_whatsapp(id) ON DELETE CASCADE,
  envio_id uuid REFERENCES public.campanhas_whatsapp_envios(id) ON DELETE SET NULL,
  user_id uuid,
  telefone text NOT NULL,
  mensagem text NOT NULL,
  cidade text,
  estado text,
  contexto jsonb,
  processada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campanhas_whatsapp_respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem ver respostas de campanhas"
  ON public.campanhas_whatsapp_respostas FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

CREATE INDEX idx_campanhas_respostas_campanha ON public.campanhas_whatsapp_respostas(campanha_id);

-- 4) Coluna estado em profiles + índices
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS estado text;
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON public.profiles(estado);
CREATE INDEX IF NOT EXISTS idx_profiles_cidade ON public.profiles(cidade);
