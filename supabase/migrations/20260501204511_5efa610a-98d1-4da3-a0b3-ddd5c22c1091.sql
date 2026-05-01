
-- =========================================================
-- Parte 1: Portão de cadastro em auth.users (modo restrito)
-- =========================================================

CREATE OR REPLACE FUNCTION public.enforce_invite_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restrito boolean;
  v_provider text;
  v_email text;
  v_convite_id uuid;
BEGIN
  -- Lê flag global
  SELECT (valor::text)::boolean INTO v_restrito
  FROM public.app_config
  WHERE chave = 'acesso_restrito';

  IF COALESCE(v_restrito, false) = false THEN
    RETURN NEW; -- modo aberto: nada a fazer
  END IF;

  v_email := lower(coalesce(NEW.email, ''));
  v_provider := coalesce(NEW.raw_app_meta_data->>'provider', 'email');

  IF v_email = '' THEN
    RAISE EXCEPTION 'PICOTINHO_NO_INVITE: cadastro restrito - e-mail ausente';
  END IF;

  IF v_provider = 'email' THEN
    -- Para e-mail/senha, exigimos convite RESERVADO (estado deixado pelo consumir-convite)
    SELECT id INTO v_convite_id
    FROM public.convites_acesso
    WHERE lower(email_destino) = v_email
      AND status = 'reservado'
      AND token_expira_em IS NOT NULL
      AND token_expira_em > now()
    LIMIT 1;
  ELSE
    -- OAuth: aceita convite disponível ou reservado, ainda não expirado
    SELECT id INTO v_convite_id
    FROM public.convites_acesso
    WHERE lower(email_destino) = v_email
      AND status IN ('disponivel', 'reservado')
      AND (expira_em IS NULL OR expira_em > now())
      AND (status <> 'reservado' OR token_expira_em IS NULL OR token_expira_em > now())
    LIMIT 1;
  END IF;

  IF v_convite_id IS NULL THEN
    RAISE EXCEPTION 'PICOTINHO_NO_INVITE: cadastro restrito a usuários convidados';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picotinho_enforce_invite_on_signup ON auth.users;
CREATE TRIGGER picotinho_enforce_invite_on_signup
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invite_on_signup();

-- AFTER INSERT: marca convite como usado em cadastros OAuth
CREATE OR REPLACE FUNCTION public.mark_invite_used_after_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restrito boolean;
  v_provider text;
  v_email text;
BEGIN
  SELECT (valor::text)::boolean INTO v_restrito
  FROM public.app_config
  WHERE chave = 'acesso_restrito';

  IF COALESCE(v_restrito, false) = false THEN
    RETURN NEW;
  END IF;

  v_provider := coalesce(NEW.raw_app_meta_data->>'provider', 'email');
  IF v_provider = 'email' THEN
    -- fluxo de e-mail é finalizado pela edge confirmar-convite
    RETURN NEW;
  END IF;

  v_email := lower(coalesce(NEW.email, ''));

  UPDATE public.convites_acesso
  SET status = 'usado',
      usado_por = NEW.id,
      usado_em = now(),
      token_temp = NULL,
      token_expira_em = NULL
  WHERE id = (
    SELECT id
    FROM public.convites_acesso
    WHERE lower(email_destino) = v_email
      AND status IN ('disponivel', 'reservado')
    ORDER BY created_at DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picotinho_mark_invite_used_after_signup ON auth.users;
CREATE TRIGGER picotinho_mark_invite_used_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.mark_invite_used_after_signup();

-- =========================================================
-- Parte 2: Tabela de log de alteração do acesso_restrito
-- =========================================================

CREATE TABLE IF NOT EXISTS public.acesso_restrito_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alterado_por uuid NOT NULL,
  email text,
  valor_anterior boolean NOT NULL,
  valor_novo boolean NOT NULL,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.acesso_restrito_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Masters podem ver logs de acesso_restrito" ON public.acesso_restrito_log;
CREATE POLICY "Masters podem ver logs de acesso_restrito"
ON public.acesso_restrito_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- Sem políticas de INSERT/UPDATE/DELETE: somente service_role pode escrever.

CREATE INDEX IF NOT EXISTS idx_acesso_restrito_log_alterado_em
ON public.acesso_restrito_log (alterado_em DESC);
