-- 1. Remover trigger de prevenção temporariamente
DROP TRIGGER IF EXISTS prevent_unauthorized_changes ON public.profiles;

-- 2. Criar perfis faltantes
INSERT INTO public.profiles (user_id, email, nome_completo)
SELECT 
  au.id,
  au.email,
  au.raw_user_meta_data->>'nome_completo'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = au.id
)
ON CONFLICT (user_id) DO NOTHING;

-- 3. Sincronizar todos os emails
UPDATE public.profiles p
SET 
  email = au.email,
  updated_at = NOW()
FROM auth.users au
WHERE p.user_id = au.id;

-- 4. Atualizar função handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, nome_completo)
  VALUES (
    NEW.id, 
    NEW.email,
    NEW.raw_user_meta_data->>'nome_completo'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    nome_completo = COALESCE(EXCLUDED.nome_completo, profiles.nome_completo),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;

-- 5. Criar trigger para novos usuários
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();