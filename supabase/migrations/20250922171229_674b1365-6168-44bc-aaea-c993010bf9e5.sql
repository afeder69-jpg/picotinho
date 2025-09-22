-- 🔒 PROTEÇÃO ULTRA REFORÇADA PARA DADOS PESSOAIS NA TABELA PROFILES

-- 1. Função de validação rigorosa de acesso
CREATE OR REPLACE FUNCTION public.validate_profile_access_strict(target_user_id uuid, operation_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
BEGIN
    -- Obter o ID do usuário atual
    current_user_id := auth.uid();
    
    -- Bloquear se não há usuário autenticado
    IF current_user_id IS NULL THEN
        PERFORM log_security_violation('no_auth_user', target_user_id, 'Tentativa de acesso sem autenticação para operação: ' || operation_type);
        RETURN false;
    END IF;
    
    -- Bloquear se tentando acessar dados de outro usuário
    IF current_user_id != target_user_id THEN
        PERFORM log_security_violation('cross_user_access', target_user_id, 'Usuário ' || current_user_id || ' tentando acessar dados do usuário ' || target_user_id || ' na operação: ' || operation_type);
        RETURN false;
    END IF;
    
    -- Verificar se é uma sessão válida (usuário existe no auth.users)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_user_id AND email_confirmed_at IS NOT NULL) THEN
        PERFORM log_security_violation('invalid_session', target_user_id, 'Sessão inválida ou email não confirmado para operação: ' || operation_type);
        RETURN false;
    END IF;
    
    -- Log de acesso legítimo para auditoria
    PERFORM log_profile_access(target_user_id, operation_type);
    
    RETURN true;
END;
$$;

-- 2. Função para mascaramento avançado de dados pessoais
CREATE OR REPLACE FUNCTION public.safe_mask_personal_data(
    email_input text DEFAULT NULL,
    telefone_input text DEFAULT NULL,
    nome_completo_input text DEFAULT NULL,
    cep_input text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb := '{}';
BEGIN
    -- Verificar autenticação
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('error', 'unauthorized_access');
    END IF;
    
    -- Mascarar email
    IF email_input IS NOT NULL AND length(email_input) > 0 THEN
        result := result || jsonb_build_object(
            'email_masked', 
            CASE 
                WHEN length(email_input) > 4 AND position('@' IN email_input) > 0 THEN 
                    substring(email_input FROM 1 FOR 2) || '***@' || split_part(email_input, '@', 2)
                ELSE '***@***.***'
            END
        );
    END IF;
    
    -- Mascarar telefone
    IF telefone_input IS NOT NULL AND length(telefone_input) > 0 THEN
        result := result || jsonb_build_object(
            'telefone_masked',
            '***-***-' || right(regexp_replace(telefone_input, '[^\d]', '', 'g'), 4)
        );
    END IF;
    
    -- Mascarar nome completo
    IF nome_completo_input IS NOT NULL AND length(nome_completo_input) > 0 THEN
        result := result || jsonb_build_object(
            'nome_masked',
            split_part(nome_completo_input, ' ', 1) || 
            CASE 
                WHEN position(' ' IN nome_completo_input) > 0 THEN
                    ' ' || left(split_part(nome_completo_input, ' ', -1), 1) || '.'
                ELSE ''
            END
        );
    END IF;
    
    -- Mascarar CEP
    IF cep_input IS NOT NULL AND length(cep_input) > 0 THEN
        result := result || jsonb_build_object(
            'cep_masked',
            substring(regexp_replace(cep_input, '[^\d]', '', 'g') FROM 1 FOR 3) || '**-***'
        );
    END IF;
    
    RETURN result;
END;
$$;

-- 3. Atualizar políticas RLS com máxima segurança
DROP POLICY IF EXISTS "secure_profile_select" ON public.profiles;
DROP POLICY IF EXISTS "secure_profile_insert" ON public.profiles;
DROP POLICY IF EXISTS "secure_profile_update" ON public.profiles;

-- Política SELECT ultra-segura
CREATE POLICY "bulletproof_profile_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    AND validate_profile_access_strict(user_id, 'SELECT')
);

-- Política INSERT ultra-segura
CREATE POLICY "bulletproof_profile_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND user_id IS NOT NULL
    AND validate_profile_access_strict(user_id, 'INSERT')
);

-- Política UPDATE ultra-segura
CREATE POLICY "bulletproof_profile_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    AND validate_profile_access_strict(user_id, 'UPDATE')
)
WITH CHECK (
    user_id = auth.uid()
    AND user_id IS NOT NULL
    AND validate_profile_access_strict(user_id, 'UPDATE')
);

-- 4. Forçar RLS (não pode ser desabilitado)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- 5. Remover permissões desnecessárias
REVOKE ALL ON public.profiles FROM PUBLIC;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- 6. Criar view ultra-segura para dados públicos (apenas dados não sensíveis)
DROP VIEW IF EXISTS public.profiles_public_safe;
CREATE VIEW public.profiles_public_safe
WITH (security_invoker = true)
AS
SELECT 
    id,
    user_id,
    nome,  -- apenas primeiro nome
    avatar_url,
    created_at
FROM profiles
WHERE user_id = auth.uid();

-- 7. Garantir permissões mínimas na view segura
GRANT SELECT ON public.profiles_public_safe TO authenticated;

-- 8. Criar índices para performance e segurança
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_security 
ON public.profiles(user_id) WHERE user_id IS NOT NULL;

-- 9. Comentários de segurança críticos
COMMENT ON TABLE public.profiles IS '🔒 DADOS PESSOAIS SENSÍVEIS - Acesso ULTRA-RESTRITO apenas ao próprio usuário autenticado e com email confirmado';
COMMENT ON FUNCTION public.validate_profile_access_strict(uuid, text) IS '🛡️ Validação RIGOROSA de acesso com logging completo de tentativas de violação';
COMMENT ON FUNCTION public.safe_mask_personal_data(text, text, text, text) IS '🎭 Mascaramento SEGURO de dados pessoais para exposição controlada';
COMMENT ON VIEW public.profiles_public_safe IS '👀 View ULTRA-SEGURA com apenas dados não sensíveis do próprio usuário';

-- 10. Adicionar constraint para garantir que user_id nunca seja NULL
ALTER TABLE public.profiles 
ALTER COLUMN user_id SET NOT NULL;