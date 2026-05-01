-- 1) Atualizar check constraint de status para incluir 'cancelado'
ALTER TABLE public.convites_acesso
  DROP CONSTRAINT IF EXISTS convites_acesso_status_check;

ALTER TABLE public.convites_acesso
  ADD CONSTRAINT convites_acesso_status_check
  CHECK (status IN ('disponivel', 'reservado', 'usado', 'cancelado'));

-- 2) Atualizar RPC validar_codigo_convite para tratar 'cancelado'
CREATE OR REPLACE FUNCTION public.validar_codigo_convite(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_convite public.convites_acesso%ROWTYPE;
BEGIN
  -- Validação de formato
  IF _codigo IS NULL OR _codigo !~ '^[A-Z0-9]{8}$' THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'formato_invalido');
  END IF;

  SELECT * INTO v_convite
  FROM public.convites_acesso
  WHERE codigo = _codigo
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'inexistente');
  END IF;

  IF v_convite.status = 'usado' THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'usado');
  END IF;

  IF v_convite.status = 'cancelado' THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'cancelado');
  END IF;

  IF v_convite.expira_em IS NOT NULL AND v_convite.expira_em < now() THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'expirado');
  END IF;

  IF v_convite.status = 'reservado'
     AND v_convite.token_expira_em IS NOT NULL
     AND v_convite.token_expira_em > now() THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'reservado');
  END IF;

  RETURN jsonb_build_object(
    'valido', true,
    'email_destino', v_convite.email_destino
  );
END;
$$;

-- 3) Policies para masters gerenciarem convites via tela admin
DROP POLICY IF EXISTS "Masters podem ver todos convites" ON public.convites_acesso;
CREATE POLICY "Masters podem ver todos convites"
ON public.convites_acesso
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Masters podem criar convites" ON public.convites_acesso;
CREATE POLICY "Masters podem criar convites"
ON public.convites_acesso
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Masters podem cancelar convites" ON public.convites_acesso;
CREATE POLICY "Masters podem cancelar convites"
ON public.convites_acesso
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master') AND status IN ('disponivel', 'reservado'))
WITH CHECK (public.has_role(auth.uid(), 'master'));