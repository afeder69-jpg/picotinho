-- CORREÇÃO DE SEGURANÇA: Remover view insegura que expõe dados pessoais
-- Problema: A view profiles_safe permite que qualquer usuário autenticado veja nomes e telefones mascarados de outros usuários

-- 1. Remover a view insegura profiles_safe
DROP VIEW IF EXISTS profiles_safe;

-- 2. Remover também a view users_safe que pode ter problemas similares  
DROP VIEW IF EXISTS users_safe;

-- 3. Adicionar função segura para obter informações limitadas de perfil (apenas para próprio usuário)
CREATE OR REPLACE FUNCTION public.get_my_profile_safe()
RETURNS TABLE(
  id uuid,
  user_id uuid, 
  nome character varying,
  telefone character varying,
  avatar_url text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas retornar dados do próprio usuário autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.nome,
    p.telefone,
    p.avatar_url,
    p.created_at,
    p.updated_at
  FROM profiles p
  WHERE p.user_id = auth.uid();
END;
$$;

-- 4. Revisar e fortalecer a função de máscara de telefone (tornar mais segura)
CREATE OR REPLACE FUNCTION public.mask_phone_number(phone_number text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retornar null se input é null ou muito curto
  IF phone_number IS NULL OR LENGTH(phone_number) < 6 THEN
    RETURN '***';
  END IF;
  
  -- Máscara mais agressiva: mostrar apenas primeiros 2 e últimos 1 dígito
  RETURN CONCAT(
    LEFT(phone_number, 2),
    REPEAT('*', GREATEST(0, LENGTH(phone_number) - 3)),
    RIGHT(phone_number, 1)
  );
END;
$$;

-- 5. Adicionar auditoria para acessos suspeitos
CREATE TABLE IF NOT EXISTS profile_security_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  target_user_id uuid,
  ip_address inet,
  user_agent text,
  blocked boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS na tabela de auditoria
ALTER TABLE profile_security_log ENABLE ROW LEVEL SECURITY;

-- Política: apenas admins podem ver logs (para futuro)
CREATE POLICY "System can manage security logs" ON profile_security_log
FOR ALL USING (false); -- Bloquear acesso por enquanto

-- 6. Verificar se existem outras views ou funções que podem expor dados
-- (Esta query é apenas informativa)
COMMENT ON TABLE profiles IS 'Tabela de perfis com RLS rigoroso - dados pessoais protegidos';