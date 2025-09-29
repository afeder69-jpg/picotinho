-- Corrigir função para ter search_path correto
CREATE OR REPLACE FUNCTION public.update_consumos_app_updated_at()
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