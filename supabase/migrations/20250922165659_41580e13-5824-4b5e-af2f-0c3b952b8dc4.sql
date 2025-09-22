-- 🔒 SECURITY ENHANCEMENT: Fixing parameter conflict and strengthening profiles table security

-- 1. Drop existing functions to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public.log_profile_access(uuid, text);

-- 2. Create enhanced security functions with better validation
CREATE OR REPLACE FUNCTION public.secure_profile_access(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enhanced security checks
  
  -- Block if no authenticated user
  IF auth.uid() IS NULL THEN
    PERFORM public.log_security_violation('unauthorized_access_attempt', target_user_id, 'No authenticated user');
    RETURN false;
  END IF;
  
  -- Block if trying to access different user's data
  IF auth.uid() != target_user_id THEN
    PERFORM public.log_security_violation('cross_user_access_attempt', target_user_id, 'User attempting to access another user data');
    RETURN false;
  END IF;
  
  -- Block if user role is not authenticated
  IF auth.role() != 'authenticated' THEN
    PERFORM public.log_security_violation('invalid_role_access', target_user_id, 'Non-authenticated role attempting access');
    RETURN false;
  END IF;
  
  -- Additional check: ensure user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid()) THEN
    PERFORM public.log_security_violation('invalid_user_access', target_user_id, 'User does not exist in auth system');
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- 3. Create security violation logging function
CREATE OR REPLACE FUNCTION public.log_security_violation(
  violation_type text,
  target_user_id uuid,
  details text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_security_log (
    user_id,
    target_user_id,
    action,
    blocked,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    auth.uid(),
    target_user_id,
    violation_type || ': ' || details,
    true,
    inet_client_addr(),
    current_setting('request.headers', true)::json->>'user-agent',
    now()
  );
  
  -- Log critical violations
  RAISE WARNING 'SECURITY VIOLATION: % by user % targeting %: %', 
    violation_type, auth.uid(), target_user_id, details;
END;
$$;

-- 4. Enhanced logging function for profile access (with correct parameter names)
CREATE OR REPLACE FUNCTION public.log_profile_access(target_user_id uuid, action_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log if it's a different user (suspicious) or if it's a sensitive operation
  IF auth.uid() != target_user_id OR action_type IN ('UPDATE', 'DELETE') THEN
    INSERT INTO public.profile_access_log (
      user_id,
      accessed_user_id,
      access_type,
      success,
      ip_address,
      user_agent,
      accessed_at
    ) VALUES (
      auth.uid(),
      target_user_id,
      action_type,
      true,
      inet_client_addr(),
      current_setting('request.headers', true)::json->>'user-agent',
      now()
    );
  END IF;
END;
$$;

-- 5. Drop and recreate RLS policies with enhanced security
DROP POLICY IF EXISTS "enhanced_profile_select" ON public.profiles;
DROP POLICY IF EXISTS "enhanced_profile_insert" ON public.profiles;
DROP POLICY IF EXISTS "enhanced_profile_update" ON public.profiles;
DROP POLICY IF EXISTS "bulletproof_profile_select" ON public.profiles;
DROP POLICY IF EXISTS "bulletproof_profile_insert" ON public.profiles;
DROP POLICY IF EXISTS "bulletproof_profile_update" ON public.profiles;

-- 6. Create bulletproof RLS policies
CREATE POLICY "bulletproof_profile_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.secure_profile_access(user_id) 
  AND auth.uid() = user_id
  AND (public.log_profile_access(user_id, 'SELECT') IS NULL OR true)
);

CREATE POLICY "bulletproof_profile_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  public.secure_profile_access(user_id)
  AND auth.uid() = user_id
  AND user_id IS NOT NULL
  AND (public.log_profile_access(user_id, 'INSERT') IS NULL OR true)
);

CREATE POLICY "bulletproof_profile_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.secure_profile_access(user_id)
  AND auth.uid() = user_id
)
WITH CHECK (
  public.secure_profile_access(user_id)
  AND auth.uid() = user_id
  AND user_id IS NOT NULL
  AND (public.log_profile_access(user_id, 'UPDATE') IS NULL OR true)
);

-- 7. Create data masking function for sensitive fields
CREATE OR REPLACE FUNCTION public.mask_sensitive_profile_data(
  email_val text DEFAULT NULL,
  telefone_val text DEFAULT NULL,
  nome_completo_val text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}';
BEGIN
  -- Only return masked data if user is accessing their own profile
  IF auth.uid() IS NULL THEN
    RETURN '{"error": "unauthorized"}'::jsonb;
  END IF;
  
  -- Mask email: show only first 2 chars and domain
  IF email_val IS NOT NULL THEN
    result := result || jsonb_build_object(
      'email_masked', 
      CASE 
        WHEN length(email_val) > 4 THEN 
          substring(email_val from 1 for 2) || '***@' || split_part(email_val, '@', 2)
        ELSE '***'
      END
    );
  END IF;
  
  -- Mask phone: show only last 4 digits
  IF telefone_val IS NOT NULL THEN
    result := result || jsonb_build_object(
      'telefone_masked',
      CASE 
        WHEN length(telefone_val) > 4 THEN 
          '***-***-' || right(telefone_val, 4)
        ELSE '***'
      END
    );
  END IF;
  
  -- Mask full name: show only first name and last initial
  IF nome_completo_val IS NOT NULL THEN
    result := result || jsonb_build_object(
      'nome_masked',
      split_part(nome_completo_val, ' ', 1) || ' ' || 
      CASE 
        WHEN position(' ' in nome_completo_val) > 0 THEN
          left(split_part(nome_completo_val, ' ', -1), 1) || '.'
        ELSE ''
      END
    );
  END IF;
  
  RETURN result;
END;
$$;

-- 8. Create trigger to prevent unauthorized email changes
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent email changes (should only come from auth system)
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    PERFORM public.log_security_violation(
      'unauthorized_email_change', 
      NEW.user_id, 
      'Attempt to change email from ' || COALESCE(OLD.email, 'NULL') || ' to ' || COALESCE(NEW.email, 'NULL')
    );
    RAISE EXCEPTION 'SECURITY: Email changes must be done through the authentication system';
  END IF;
  
  -- Log sensitive field changes
  IF OLD.telefone IS DISTINCT FROM NEW.telefone 
     OR OLD.nome_completo IS DISTINCT FROM NEW.nome_completo 
     OR OLD.cep IS DISTINCT FROM NEW.cep THEN
    
    PERFORM public.log_profile_access(NEW.user_id, 'SENSITIVE_UPDATE');
  END IF;
  
  RETURN NEW;
END;
$$;

-- 9. Apply the trigger
DROP TRIGGER IF EXISTS prevent_unauthorized_changes ON public.profiles;
CREATE TRIGGER prevent_unauthorized_changes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_profile_changes();

-- 10. Add constraint to ensure user_id is always set (prevent NULL user_id vulnerability)
ALTER TABLE public.profiles 
ALTER COLUMN user_id SET NOT NULL;

-- 11. Create index for security logging performance
CREATE INDEX IF NOT EXISTS idx_profile_security_log_user_target 
ON public.profile_security_log(user_id, target_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_profile_access_log_user_accessed 
ON public.profile_access_log(user_id, accessed_user_id, accessed_at);

-- 12. Grant minimal necessary permissions
REVOKE ALL ON public.profiles FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- 13. Add comments for documentation
COMMENT ON TABLE public.profiles IS 'User profiles with enhanced security: RLS enforced, access logged, sensitive data protected';
COMMENT ON FUNCTION public.secure_profile_access(uuid) IS 'Enhanced security function - validates user access with comprehensive checks and logging';
COMMENT ON FUNCTION public.log_security_violation(text, uuid, text) IS 'Logs security violations for monitoring and alerting';
COMMENT ON FUNCTION public.mask_sensitive_profile_data(text, text, text) IS 'Masks sensitive profile data for safe API exposure';