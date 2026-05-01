-- ============================================================
-- 1. Tabela app_config (configurações globais)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_config (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Leitura pública (anon + authenticated) — flag precisa ser legível por todos
CREATE POLICY "app_config legivel por todos"
  ON public.app_config FOR SELECT
  USING (true);

-- Apenas master pode escrever
CREATE POLICY "Apenas master pode inserir app_config"
  ON public.app_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Apenas master pode atualizar app_config"
  ON public.app_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Apenas master pode deletar app_config"
  ON public.app_config FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_app_config_updated_at
  BEFORE UPDATE ON public.app_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial: acesso restrito ATIVO
INSERT INTO public.app_config (chave, valor)
VALUES ('acesso_restrito', 'true'::jsonb)
ON CONFLICT (chave) DO NOTHING;


-- ============================================================
-- 2. Tabela convites_acesso (sistema de convites)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.convites_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  email_destino TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel',
  token_temp TEXT,
  token_expira_em TIMESTAMPTZ,
  criado_por UUID,
  usado_por UUID,
  usado_em TIMESTAMPTZ,
  expira_em TIMESTAMPTZ,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT convites_acesso_codigo_formato CHECK (codigo ~ '^[A-Z0-9]{8}$'),
  CONSTRAINT convites_acesso_status_valido CHECK (status IN ('disponivel', 'reservado', 'usado'))
);

CREATE INDEX IF NOT EXISTS idx_convites_acesso_codigo ON public.convites_acesso (codigo);
CREATE INDEX IF NOT EXISTS idx_convites_acesso_status ON public.convites_acesso (status);
CREATE INDEX IF NOT EXISTS idx_convites_acesso_token ON public.convites_acesso (token_temp) WHERE token_temp IS NOT NULL;

ALTER TABLE public.convites_acesso ENABLE ROW LEVEL SECURITY;

-- Apenas master pode gerenciar convites pelo client
CREATE POLICY "Master pode ver convites"
  ON public.convites_acesso FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Master pode criar convites"
  ON public.convites_acesso FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Master pode atualizar convites"
  ON public.convites_acesso FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Master pode deletar convites"
  ON public.convites_acesso FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER update_convites_acesso_updated_at
  BEFORE UPDATE ON public.convites_acesso
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 3. RPC validar_codigo_convite (apenas leitura/checagem)
-- ============================================================
CREATE OR REPLACE FUNCTION public.validar_codigo_convite(_codigo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo TEXT;
  v_convite RECORD;
BEGIN
  -- Normalizar
  v_codigo := UPPER(TRIM(COALESCE(_codigo, '')));

  -- Validar formato
  IF v_codigo !~ '^[A-Z0-9]{8}$' THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'formato_invalido');
  END IF;

  SELECT * INTO v_convite
  FROM public.convites_acesso
  WHERE codigo = v_codigo
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'inexistente');
  END IF;

  IF v_convite.status = 'usado' THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'usado');
  END IF;

  IF v_convite.expira_em IS NOT NULL AND v_convite.expira_em < now() THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'expirado');
  END IF;

  IF v_convite.status = 'reservado'
     AND v_convite.token_expira_em IS NOT NULL
     AND v_convite.token_expira_em > now() THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'reservado');
  END IF;

  RETURN jsonb_build_object('valido', true, 'motivo', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_codigo_convite(TEXT) TO anon, authenticated;