-- Criar função para inserir configuração padrão de raio para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Inserir configuração padrão de 5 km para o novo usuário
  INSERT INTO public.configuracoes_usuario (usuario_id, raio_busca_km)
  VALUES (NEW.id, 5.0)
  ON CONFLICT (usuario_id) DO NOTHING; -- Evitar erro se já existir
  
  RETURN NEW;
END;
$$;

-- Criar trigger para executar a função quando um novo usuário for criado
DROP TRIGGER IF EXISTS on_auth_user_created_config ON auth.users;
CREATE TRIGGER on_auth_user_created_config
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_config();

-- Comentário explicativo
COMMENT ON FUNCTION public.handle_new_user_config() IS 'Cria automaticamente configuração padrão de 5km de raio para novos usuários cadastrados no sistema';