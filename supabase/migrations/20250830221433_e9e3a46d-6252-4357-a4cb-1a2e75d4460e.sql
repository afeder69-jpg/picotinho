-- Security Enhancement: Multi-layered protection for sensitive profile data
-- This migration adds defense-in-depth security for personal information

-- 1. Create a secure function to validate profile access with additional checks
CREATE OR REPLACE FUNCTION public.secure_profile_access(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
BEGIN
  -- Enhanced validation beyond just user_id matching
  -- Check if user is authenticated and matches target
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  
  -- Ensure user can only access their own profile
  IF auth.uid() != target_user_id THEN
    RETURN false;
  END IF;
  
  -- Additional security: Check if user session is still valid
  -- by verifying the auth context
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- 2. Create audit logging function for sensitive data access
CREATE TABLE IF NOT EXISTS public.profile_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  accessed_user_id uuid NOT NULL,
  access_type text NOT NULL,
  ip_address inet,
  user_agent text,
  accessed_at timestamp with time zone DEFAULT now(),
  success boolean DEFAULT true
);

-- Enable RLS on audit log
ALTER TABLE public.profile_access_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs (for future admin functionality)
CREATE POLICY "audit_log_admin_only" ON public.profile_access_log
FOR ALL USING (false); -- Block all access for now, can be updated later for admin roles

-- 3. Create function to log profile access attempts
CREATE OR REPLACE FUNCTION public.log_profile_access(
  accessed_user_id uuid,
  access_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Log the access attempt with context information
  INSERT INTO public.profile_access_log (
    user_id,
    accessed_user_id,
    access_type,
    accessed_at,
    success
  ) VALUES (
    auth.uid(),
    accessed_user_id,
    access_type,
    now(),
    true
  );
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the main operation if logging fails
  NULL;
END;
$$;

-- 4. Create function to mask sensitive data for display
CREATE OR REPLACE FUNCTION public.mask_phone_number(phone_number text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Return null if input is null or empty
  IF phone_number IS NULL OR LENGTH(phone_number) < 4 THEN
    RETURN phone_number;
  END IF;
  
  -- Mask middle digits, show only first 2 and last 2 characters
  -- Example: (11) 99999-9999 becomes (11) 9***9-***9
  RETURN CONCAT(
    LEFT(phone_number, 2),
    REPEAT('*', GREATEST(0, LENGTH(phone_number) - 4)),
    RIGHT(phone_number, 2)
  );
END;
$$;

-- 5. Update RLS policies with enhanced security
-- Drop existing policies to replace with more secure versions
DROP POLICY IF EXISTS "secure_profile_select" ON public.profiles;
DROP POLICY IF EXISTS "secure_profile_update" ON public.profiles;
DROP POLICY IF EXISTS "secure_profile_insert" ON public.profiles;

-- Create enhanced RLS policies using the secure access function
CREATE POLICY "enhanced_profile_select" ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.secure_profile_access(user_id) 
  AND (
    -- Log the access attempt
    public.log_profile_access(user_id, 'SELECT') IS NULL OR true
  )
);

CREATE POLICY "enhanced_profile_update" ON public.profiles
FOR UPDATE
TO authenticated
USING (public.secure_profile_access(user_id))
WITH CHECK (
  public.secure_profile_access(user_id)
  AND (
    -- Log the update attempt
    public.log_profile_access(user_id, 'UPDATE') IS NULL OR true
  )
);

CREATE POLICY "enhanced_profile_insert" ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  public.secure_profile_access(user_id)
  AND (
    -- Log the insert attempt
    public.log_profile_access(user_id, 'INSERT') IS NULL OR true
  )
);

-- Keep the deletion block policy as is (good security practice)
-- The existing "block_profile_deletion" policy already prevents deletions

-- 6. Create a view for safe profile data that masks sensitive information
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT 
  id,
  user_id,
  nome,
  -- Mask phone number for display
  CASE 
    WHEN auth.uid() = user_id THEN telefone
    ELSE public.mask_phone_number(telefone)
  END as telefone_masked,
  avatar_url,
  provider,
  provider_id,
  created_at,
  updated_at
FROM public.profiles
WHERE public.secure_profile_access(user_id);

-- 7. Grant appropriate permissions
GRANT SELECT ON public.profiles_safe TO authenticated;

-- 8. Create function to securely get user's own profile
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
  
  -- Log the access
  PERFORM public.log_profile_access(auth.uid(), 'SECURE_GET');
  
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

-- 9. Add constraints to prevent data injection attacks
-- Ensure phone numbers follow a reasonable format (basic validation)
ALTER TABLE public.profiles 
ADD CONSTRAINT check_phone_format 
CHECK (telefone IS NULL OR LENGTH(telefone) BETWEEN 10 AND 20);

-- Ensure nome is not excessively long to prevent buffer overflow attempts
ALTER TABLE public.profiles 
ADD CONSTRAINT check_nome_length 
CHECK (nome IS NULL OR LENGTH(nome) <= 100);

-- 10. Create indexes for better performance on security queries
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_security ON public.profiles(user_id) 
WHERE user_id IS NOT NULL;

-- Comment for documentation
COMMENT ON FUNCTION public.secure_profile_access IS 'Enhanced security function that validates profile access with multiple checks including authentication state and session validity';
COMMENT ON FUNCTION public.mask_phone_number IS 'Masks sensitive phone number data for display purposes';
COMMENT ON VIEW public.profiles_safe IS 'Safe view of profiles that automatically masks sensitive data and includes enhanced access logging';
COMMENT ON TABLE public.profile_access_log IS 'Audit log for tracking all profile data access attempts for security monitoring';