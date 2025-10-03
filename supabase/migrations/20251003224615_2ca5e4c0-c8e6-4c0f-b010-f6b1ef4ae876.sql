-- =====================================================
-- FASE 1B: FUNÇÃO, POLÍTICAS, AUDITORIA E PROMOÇÃO
-- =====================================================

-- 1. ATUALIZAR FUNÇÃO has_role PARA CONSIDERAR REVOGAÇÕES
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND revogado_em IS NULL  -- Ignora roles revogadas
  )
$$;

-- 2. PROMOVER USUÁRIO A ADMIN
INSERT INTO user_roles (user_id, role) 
VALUES ('ae5b5501-7f8a-46da-9cba-b9955a84e697', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. ATUALIZAR POLÍTICAS RLS

-- Remover política antiga que permite Masters gerenciarem roles
DROP POLICY IF EXISTS "Masters can manage all user roles" ON user_roles;

-- Política para admins gerenciarem roles
DROP POLICY IF EXISTS "Admins can manage user_roles" ON user_roles;
CREATE POLICY "Admins can manage user_roles"
ON user_roles FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Política para admins verem todos os perfis
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Política para Masters verem perfis relacionados às normalizações
DROP POLICY IF EXISTS "Masters can view related profiles" ON profiles;
CREATE POLICY "Masters can view related profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'master') 
  AND EXISTS (
    SELECT 1 FROM normalizacao_decisoes_log 
    WHERE decidido_por = profiles.user_id
  )
);

-- 4. CRIAR TABELA DE AUDITORIA
CREATE TABLE IF NOT EXISTS user_roles_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_role_id UUID NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('criado', 'revogado', 'reativado')),
  executado_por UUID NOT NULL REFERENCES auth.users(id),
  executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo TEXT,
  dados_anteriores JSONB,
  dados_novos JSONB
);

-- RLS: apenas admins podem ver logs de auditoria
ALTER TABLE user_roles_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON user_roles_audit_log;
CREATE POLICY "Admins can view audit logs"
ON user_roles_audit_log FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- 5. CRIAR FUNÇÃO E TRIGGER PARA LOG AUTOMÁTICO
CREATE OR REPLACE FUNCTION log_user_roles_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO user_roles_audit_log (
      user_role_id, acao, executado_por, dados_novos
    ) VALUES (
      NEW.id, 'criado', COALESCE(auth.uid(), NEW.user_id), row_to_json(NEW)::jsonb
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detectar revogação
    IF OLD.revogado_em IS NULL AND NEW.revogado_em IS NOT NULL THEN
      INSERT INTO user_roles_audit_log (
        user_role_id, acao, executado_por, motivo, dados_anteriores, dados_novos
      ) VALUES (
        NEW.id, 'revogado', NEW.revogado_por, NEW.motivo_revogacao, 
        row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb
      );
    -- Detectar reativação
    ELSIF OLD.revogado_em IS NOT NULL AND NEW.revogado_em IS NULL THEN
      INSERT INTO user_roles_audit_log (
        user_role_id, acao, executado_por, dados_anteriores, dados_novos
      ) VALUES (
        NEW.id, 'reativado', NEW.reativado_por, 
        row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_audit_trigger ON user_roles;
CREATE TRIGGER user_roles_audit_trigger
  AFTER INSERT OR UPDATE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION log_user_roles_changes();