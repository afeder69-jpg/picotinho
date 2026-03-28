CREATE OR REPLACE FUNCTION public.contar_usuarios_cadastrados()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM profiles;
$$;