CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, nome, nome_completo, telefone, provider, provider_id, avatar_url)
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
    ),
    NULLIF(NEW.raw_user_meta_data->>'telefone', ''),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    NEW.raw_user_meta_data->>'provider_id',
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    nome = COALESCE(EXCLUDED.nome, profiles.nome),
    nome_completo = COALESCE(EXCLUDED.nome_completo, profiles.nome_completo),
    telefone = COALESCE(EXCLUDED.telefone, profiles.telefone),
    provider = COALESCE(EXCLUDED.provider, profiles.provider),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;