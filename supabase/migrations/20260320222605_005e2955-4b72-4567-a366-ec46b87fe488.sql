CREATE OR REPLACE FUNCTION public.buscar_ean_por_candidato(p_candidato_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'master') THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT ean_comercial FROM estoque_app
    WHERE produto_candidato_id = p_candidato_id
      AND ean_comercial IS NOT NULL
    LIMIT 1
  );
END;
$$;