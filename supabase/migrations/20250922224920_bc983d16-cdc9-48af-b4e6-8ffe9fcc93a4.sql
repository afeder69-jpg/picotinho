-- Criar a função log_profile_access que está faltando
CREATE OR REPLACE FUNCTION public.log_profile_access(
  user_uuid uuid, 
  access_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inserir log na tabela profile_access_log
  INSERT INTO public.profile_access_log (
    user_id,
    accessed_user_id,
    access_type,
    success,
    accessed_at
  ) VALUES (
    auth.uid(),
    user_uuid,
    access_type,
    true,
    now()
  );
EXCEPTION WHEN OTHERS THEN
  -- Em caso de erro, apenas continuar sem bloquear a operação principal
  RAISE LOG 'Erro ao registrar log de acesso ao perfil: %', SQLERRM;
END;
$$;