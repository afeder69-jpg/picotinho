CREATE OR REPLACE FUNCTION public.contar_notas_sistema()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM notas_imagens;
$$;