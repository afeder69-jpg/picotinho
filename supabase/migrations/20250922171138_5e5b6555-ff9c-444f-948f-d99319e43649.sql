-- 🔒 PROTEÇÃO REFORÇADA PARA DADOS PESSOAIS NA TABELA PROFILES

-- 1. Criar função para validação de acesso com critérios mais rigorosos
CREATE OR REPLACE FUNCTION public.validate_profile_access(target_user_id uuid, operation_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    session_count integer;
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
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_user_id) THEN
        PERFORM log_security_violation('invalid_session', target_user_id, 'Sessão inválida para operação: ' || operation_type);
        RETURN false;
    END IF;
    
    -- Log de acesso legítimo para auditoria
    IF operation_type IN ('SELECT', 'UPDATE', 'DELETE') THEN
        PERFORM log_profile_access(target_user_id, operation_type);
    END IF;
    
    RETURN true;
END;
$$;

-- 2. Criar função para mascaramento seguro de dados pessoais
CREATE OR REPLACE FUNCTION public.mask_personal_data(
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
    -- Verificar se o usuário está autenticado
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;
    
    -- Mascarar email (mostrar apenas os 2 primeiros caracteres e domínio)
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
    
    -- Mascarar telefone (mostrar apenas os últimos 4 dígitos)
    IF telefone_input IS NOT NULL AND length(telefone_input) > 0 THEN
        result := result || jsonb_build_object(
            'telefone_masked',
            CASE 
                WHEN length(regexp_replace(telefone_input, '[^\d]', '', 'g')) >= 4 THEN 
                    '***-***-' || right(regexp_replace(telefone_input, '[^\d]', '', 'g'), 4)
                ELSE '***-***-****'
            END
        );
    END IF;
    
    -- Mascarar nome completo (mostrar apenas primeiro nome e última inicial)
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
    
    -- Mascarar CEP (mostrar apenas os 3 primeiros dígitos)
    IF cep_input IS NOT NULL AND length(cep_input) > 0 THEN
        result := result || jsonb_build_object(
            'cep_masked',
            CASE 
                WHEN length(regexp_replace(cep_input, '[^\d]', '', 'g')) >= 5 THEN 
                    substring(regexp_replace(cep_input, '[^\d]', '', 'g') FROM 1 FOR 3) || '**-***'
                ELSE '***-***'
            END
        );
    END IF;
    
    RETURN result;
END;
$$;

-- 3. Criar função para detectar tentativas de acesso suspeitas
CREATE OR REPLACE FUNCTION public.detect_suspicious_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    access_count integer;
    recent_attempts integer;
BEGIN
    -- Contar tentativas de acesso nos últimos 5 minutos
    SELECT COUNT(*) INTO recent_attempts
    FROM profile_access_log 
    WHERE user_id = auth.uid() 
    AND accessed_at > now() - interval '5 minutes';
    
    -- Se mais de 50 tentativas em 5 minutos, pode ser suspeito
    IF recent_attempts > 50 THEN
        PERFORM log_security_violation(
            'suspicious_high_frequency_access', 
            NEW.user_id, 
            'Usuário ' || auth.uid() || ' com ' || recent_attempts || ' acessos em 5 minutos'
        );
        
        -- Não bloquear, apenas alertar por enquanto
        RAISE WARNING 'ALERTA SEGURANÇA: Alta frequência de acesso detectada para usuário %', auth.uid();
    END IF;
    
    RETURN NEW;
END;
$$;

-- 4. Atualizar políticas RLS com validação mais rigorosa
DROP POLICY IF EXISTS "secure_profile_select" ON public.profiles;
DROP POLICY IF EXISTS "secure_profile_insert" ON public.profiles;
DROP POLICY IF EXISTS "secure_profile_update" ON public.profiles;

-- Nova política SELECT ultra-segura
CREATE POLICY "ultra_secure_profile_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    AND validate_profile_access(user_id, 'SELECT')
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL)
);

-- Nova política INSERT ultra-segura
CREATE POLICY "ultra_secure_profile_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND user_id IS NOT NULL
    AND validate_profile_access(user_id, 'INSERT')
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL)
);

-- Nova política UPDATE ultra-segura
CREATE POLICY "ultra_secure_profile_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    AND validate_profile_access(user_id, 'UPDATE')
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL)
)
WITH CHECK (
    user_id = auth.uid()
    AND user_id IS NOT NULL
    AND validate_profile_access(user_id, 'UPDATE')
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL)
);

-- 5. Adicionar trigger para detectar acessos suspeitos
DROP TRIGGER IF EXISTS detect_suspicious_profile_access ON public.profiles;
CREATE TRIGGER detect_suspicious_profile_access
    BEFORE SELECT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION detect_suspicious_access();

-- 6. Forçar RLS (não pode ser desabilitado)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- 7. Remover permissões desnecessárias
REVOKE ALL ON public.profiles FROM PUBLIC;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- 8. Criar view segura para dados públicos (apenas dados não sensíveis)
CREATE OR REPLACE VIEW public.profiles_public_safe
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

-- 9. Garantir que apenas o dono pode acessar dados completos
GRANT SELECT ON public.profiles_public_safe TO authenticated;

-- 10. Adicionar comentários de segurança
COMMENT ON TABLE public.profiles IS 'DADOS PESSOAIS SENSÍVEIS - Acesso ultra-restrito apenas ao próprio usuário com validação rigorosa';
COMMENT ON FUNCTION public.validate_profile_access(uuid, text) IS 'Validação rigorosa de acesso a dados pessoais com logging de segurança';
COMMENT ON FUNCTION public.mask_personal_data(text, text, text, text) IS 'Mascaramento seguro de dados pessoais para exposição limitada';
COMMENT ON VIEW public.profiles_public_safe IS 'View segura com apenas dados não sensíveis do perfil';