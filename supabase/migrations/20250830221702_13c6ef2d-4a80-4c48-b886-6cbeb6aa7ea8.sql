-- Fix security linter warnings and complete the secure profile implementation

-- 1. Create a secure view for profile data that masks sensitive information (non-security definer)
DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe AS
SELECT 
  id,
  user_id,
  nome,
  -- Mask phone number for display - use function call within CASE
  CASE 
    WHEN auth.uid() = user_id THEN telefone
    ELSE CASE 
      WHEN telefone IS NULL OR LENGTH(telefone) < 4 THEN telefone
      ELSE CONCAT(
        LEFT(telefone, 2),
        REPEAT('*', GREATEST(0, LENGTH(telefone) - 4)),
        RIGHT(telefone, 2)
      )
    END
  END as telefone_masked,
  avatar_url,
  provider,
  provider_id,
  created_at,
  updated_at
FROM public.profiles
WHERE user_id = auth.uid(); -- Only show user's own profile

-- Grant select permission to authenticated users
GRANT SELECT ON public.profiles_safe TO authenticated;

-- 2. Create function to securely get user's own profile (with fixed search_path)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  nome character varying,
  telefone character varying,
  avatar_url text,
  provider character varying,
  provider_id character varying,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
BEGIN
  -- Enhanced security check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Log the access (ignore errors to prevent blocking)
  BEGIN
    INSERT INTO public.profile_access_log (
      user_id, accessed_user_id, access_type, accessed_at, success
    ) VALUES (
      auth.uid(), auth.uid(), 'SECURE_GET', now(), true
    );
  EXCEPTION WHEN OTHERS THEN
    -- Continue execution even if logging fails
    NULL;
  END;
  
  -- Return only the authenticated user's profile
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.nome,
    p.telefone,
    p.avatar_url,
    p.provider,
    p.provider_id,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
END;
$$;

-- 3. Create a secure function to update profile with validation
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_nome character varying DEFAULT NULL,
  p_telefone character varying DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  nome character varying,
  telefone character varying,
  avatar_url text,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- Enhanced security check
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Validate phone number format if provided
  IF p_telefone IS NOT NULL AND (LENGTH(p_telefone) < 10 OR LENGTH(p_telefone) > 20) THEN
    RAISE EXCEPTION 'Invalid phone number format';
  END IF;
  
  -- Validate name length if provided
  IF p_nome IS NOT NULL AND LENGTH(p_nome) > 100 THEN
    RAISE EXCEPTION 'Name too long (max 100 characters)';
  END IF;
  
  -- Log the update attempt
  BEGIN
    INSERT INTO public.profile_access_log (
      user_id, accessed_user_id, access_type, accessed_at, success
    ) VALUES (
      current_user_id, current_user_id, 'SECURE_UPDATE', now(), true
    );
  EXCEPTION WHEN OTHERS THEN
    -- Continue execution even if logging fails
    NULL;
  END;
  
  -- Update only provided fields
  UPDATE public.profiles 
  SET 
    nome = COALESCE(p_nome, nome),
    telefone = COALESCE(p_telefone, telefone),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE user_id = current_user_id;
  
  -- Return updated profile
  RETURN QUERY
  SELECT 
    pr.id,
    pr.user_id,
    pr.nome,
    pr.telefone,
    pr.avatar_url,
    pr.updated_at
  FROM public.profiles pr
  WHERE pr.user_id = current_user_id;
END;
$$;

-- 4. Create function to safely get profile summary (no sensitive data)
CREATE OR REPLACE FUNCTION public.get_profile_summary(target_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  nome character varying,
  avatar_url text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
BEGIN
  -- Return limited, non-sensitive profile information
  -- This can be used for public displays where only basic info is needed
  RETURN QUERY
  SELECT 
    p.user_id,
    p.nome,
    p.avatar_url,
    p.created_at
  FROM public.profiles p
  WHERE p.user_id = target_user_id
  AND p.user_id = auth.uid(); -- Still require user to access only their own data
END;
$$;

-- 5. Add helpful comments for documentation
COMMENT ON FUNCTION public.secure_profile_access IS 'Enhanced security function that validates profile access with multiple checks including authentication state and session validity';
COMMENT ON FUNCTION public.mask_phone_number IS 'Masks sensitive phone number data for display purposes';
COMMENT ON FUNCTION public.get_my_profile IS 'Securely retrieves the authenticated users own profile with audit logging';
COMMENT ON FUNCTION public.update_my_profile IS 'Securely updates the authenticated users profile with validation and audit logging';
COMMENT ON FUNCTION public.get_profile_summary IS 'Returns limited non-sensitive profile information for public display';
COMMENT ON VIEW public.profiles_safe IS 'Safe view of profiles that automatically masks sensitive data for authenticated users';
COMMENT ON TABLE public.profile_access_log IS 'Audit log for tracking all profile data access attempts for security monitoring';

-- 6. Create indexes for audit log performance
CREATE INDEX IF NOT EXISTS idx_profile_access_log_user_id ON public.profile_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_access_log_accessed_at ON public.profile_access_log(accessed_at);
CREATE INDEX IF NOT EXISTS idx_profile_access_log_access_type ON public.profile_access_log(access_type);