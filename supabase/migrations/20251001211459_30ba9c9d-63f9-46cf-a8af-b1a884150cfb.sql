-- Corrigir função criada anteriormente para ter search_path seguro
CREATE OR REPLACE FUNCTION public.update_normalizacao_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;