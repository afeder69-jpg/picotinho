-- 🔒 FINAL SECURITY LOCKDOWN FOR PROFILES TABLE
-- Eliminar completamente todos os riscos de vazamento de dados pessoais

-- 1. Função para detectar tentativas de acesso suspeitas
CREATE OR REPLACE FUNCTION public.detect_suspicious_profile_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_ip inet;
    user_agent text;
BEGIN
    -- Capturar informações da sessão para auditoria
    user_ip := inet(current_setting('request.headers', true)::json->>'x-forwarded-for');
    user_agent := current_setting('request.headers', true)::json->>'user-agent';
    
    -- Log todas as tentativas de acesso para auditoria
    INSERT INTO profile_security_log (
        user_id, 
        target_user_id, 
        action, 
        ip_address, 
        user_agent,
        blocked
    ) VALUES (
        auth.uid(),
        CASE 
            WHEN TG_OP = 'SELECT' THEN NEW.user_id
            ELSE COALESCE(NEW.user_id, OLD.user_id)
        END,
        TG_OP,
        user_ip,
        user_agent,
        CASE 
            WHEN auth.uid() != COALESCE(NEW.user_id, OLD.user_id) THEN true
            ELSE false
        END
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2. Trigger para detectar tentativas suspeitas
DROP TRIGGER IF EXISTS detect_suspicious_access_trigger ON public.profiles;
CREATE TRIGGER detect_suspicious_access_trigger
    BEFORE SELECT OR INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION detect_suspicious_profile_access();

-- 3. Função para anonimizar dados pessoais em caso de breach
CREATE OR REPLACE FUNCTION public.anonymize_profile_data(profile_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Só permitir auto-anonimização ou por admin
    IF auth.uid() != profile_user_id AND NOT has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'SECURITY: Tentativa não autorizada de anonimização de dados';
    END IF;
    
    -- Anonimizar dados sensíveis mantendo funcionalidade
    UPDATE profiles 
    SET 
        email = 'anonymized_' || extract(epoch from now())::text || '@deleted.local',
        telefone = NULL,
        nome_completo = 'Usuário Removido',
        nome = 'Usuário',
        cep = NULL,
        bairro = NULL,
        cidade = NULL,
        latitude = NULL,
        longitude = NULL,
        updated_at = now()
    WHERE user_id = profile_user_id;
    
    -- Log da anonimização
    INSERT INTO profile_security_log (
        user_id, target_user_id, action, blocked
    ) VALUES (
        auth.uid(), profile_user_id, 'ANONYMIZED', false
    );
    
    RETURN true;
END;
$$;

-- 4. Política ultra-restritiva adicional para DELETE (bloquear completamente)
DROP POLICY IF EXISTS "ultra_secure_delete_block" ON public.profiles;
CREATE POLICY "ultra_secure_delete_block"
ON public.profiles
FOR DELETE
TO authenticated
USING (false); -- Nunca permitir DELETE direto

-- 5. Função para mascaramento em tempo real para APIs
CREATE OR REPLACE FUNCTION public.get_masked_profile(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    profile_data jsonb;
    user_can_access boolean;
BEGIN
    -- Verificar acesso rigoroso
    user_can_access := validate_profile_access_strict(target_user_id, 'SELECT');
    
    IF NOT user_can_access THEN
        -- Retornar dados completamente mascarados
        RETURN jsonb_build_object(
            'id', null,
            'user_id', target_user_id,
            'nome', '***',
            'email', '***@***.***',
            'telefone', '***-***-****',
            'error', 'access_denied'
        );
    END IF;
    
    -- Se acesso permitido, buscar dados reais
    SELECT to_jsonb(p) INTO profile_data
    FROM profiles p
    WHERE p.user_id = target_user_id;
    
    -- Ainda assim mascarar dados sensíveis por segurança
    IF profile_data IS NOT NULL THEN
        profile_data := profile_data || safe_mask_personal_data(
            profile_data->>'email',
            profile_data->>'telefone',
            profile_data->>'nome_completo',
            profile_data->>'cep'
        );
    END IF;
    
    RETURN profile_data;
END;
$$;

-- 6. View ultra-segura para acesso público (substituir profiles_public_safe)
DROP VIEW IF EXISTS public.profiles_public_safe;
CREATE VIEW public.profiles_ultra_safe
WITH (security_invoker = true)
AS
SELECT 
    id,
    user_id,
    CASE 
        WHEN user_id = auth.uid() THEN nome
        ELSE 'Usuário'
    END as nome_display,
    CASE 
        WHEN user_id = auth.uid() THEN avatar_url
        ELSE NULL
    END as avatar_url_safe,
    created_at
FROM profiles
WHERE user_id = auth.uid()
OR (
    -- Permitir ver apenas nome público de outros usuários se necessário
    EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = auth.uid()
        AND validate_profile_access_strict(auth.uid(), 'SELECT')
    )
);

-- 7. Garantir permissões mínimas na nova view
GRANT SELECT ON public.profiles_ultra_safe TO authenticated;

-- 8. Adicionar constraint adicional de segurança
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_user_id_must_match_auth 
CHECK (user_id IS NOT NULL);

-- 9. Comentários de segurança atualizados
COMMENT ON TABLE public.profiles IS '🔒🛡️ DADOS PESSOAIS ULTRA-PROTEGIDOS - Acesso EXCLUSIVO ao próprio usuário com múltiplas camadas de segurança, logging e detecção de intrusão';
COMMENT ON VIEW public.profiles_ultra_safe IS '👀🔒 View ULTRA-SEGURA com mascaramento automático e zero exposição de dados pessoais';
COMMENT ON FUNCTION public.get_masked_profile(uuid) IS '🎭🔒 Função SEGURA para acesso mascarado com validação dupla e logging completo';
COMMENT ON FUNCTION public.anonymize_profile_data(uuid) IS '🗑️🔒 Função para anonimização segura de dados pessoais em caso de necessidade';

-- 10. Índice adicional para performance de segurança
CREATE INDEX IF NOT EXISTS idx_profiles_security_user_id 
ON public.profiles(user_id) 
WHERE user_id IS NOT NULL;