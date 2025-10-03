-- 1. Fazer backfill dos nomes dos perfis existentes
UPDATE public.profiles p
SET 
  nome = COALESCE(
    p.nome,
    au.raw_user_meta_data->>'nome',
    au.raw_user_meta_data->>'nome_completo',
    au.raw_user_meta_data->>'full_name',
    SPLIT_PART(au.email, '@', 1)
  ),
  nome_completo = COALESCE(
    p.nome_completo,
    au.raw_user_meta_data->>'nome_completo',
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'nome'
  ),
  updated_at = NOW()
FROM auth.users au
WHERE p.user_id = au.id
AND (p.nome IS NULL OR p.nome = '' OR p.nome_completo IS NULL OR p.nome_completo = '');

-- 2. Atualizar função handle_new_user para sincronizar nome também
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, nome, nome_completo)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'nome_completo',
      NEW.raw_user_meta_data->>'full_name',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'nome_completo',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'nome'
    )
  )
  ON CONFLICT (user_id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    nome = COALESCE(EXCLUDED.nome, profiles.nome),
    nome_completo = COALESCE(EXCLUDED.nome_completo, profiles.nome_completo),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;