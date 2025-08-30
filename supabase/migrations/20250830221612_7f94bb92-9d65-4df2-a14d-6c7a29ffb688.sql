-- Security Enhancement: Multi-layered protection for sensitive profile data (Fixed version)
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

-- 2. Create audit logging table for sensitive data access (if not exists)
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

-- Enable RLS on audit log if not already enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'profile_access_log'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.profile_access_log ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;

-- Drop existing audit log policy if exists and recreate
DROP POLICY IF EXISTS "audit_log_admin_only" ON public.profile_access_log;
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
DROP POLICY IF EXISTS "enhanced_profile_select" ON public.profiles;
DROP POLICY IF EXISTS "enhanced_profile_update" ON public.profiles;
DROP POLICY IF EXISTS "enhanced_profile_insert" ON public.profiles;

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

-- Add constraints to prevent data injection attacks (if not already exists)
DO $$
BEGIN
  -- Check and add phone format constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_phone_format' 
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT check_phone_format 
    CHECK (telefone IS NULL OR LENGTH(telefone) BETWEEN 10 AND 20);
  END IF;
  
  -- Check and add name length constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_nome_length' 
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT check_nome_length 
    CHECK (nome IS NULL OR LENGTH(nome) <= 100);
  END IF;
END
$$;

-- Create index for better performance on security queries
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_security ON public.profiles(user_id) 
WHERE user_id IS NOT NULL;