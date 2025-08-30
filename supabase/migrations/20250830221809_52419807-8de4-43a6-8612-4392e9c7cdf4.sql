-- Fix remaining security linter warnings - Function Search Path issues

-- Fix existing functions that don't have search_path set
-- Note: We already have SET search_path = 'public' on our new functions

-- Fix the log_profile_access function to properly set search_path
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

-- Fix the mask_phone_number function to set search_path
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

-- Let's see if there are other functions we need to check by looking at existing ones
-- We'll review and potentially update other functions if needed

-- Check if we have any security definer views that need to be addressed
-- The profiles_safe view we created is already non-security definer

-- Add final validation to ensure all our new security measures are working
-- Test the enhanced security with a validation function
CREATE OR REPLACE FUNCTION public.validate_security_setup()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result text := 'Security validation: ';
  rls_enabled boolean;
  policies_count integer;
BEGIN
  -- Check if RLS is enabled on profiles table
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class 
  WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace;
  
  IF rls_enabled THEN
    result := result || 'RLS enabled ✓ ';
  ELSE
    result := result || 'RLS disabled ✗ ';
  END IF;
  
  -- Check if we have RLS policies on profiles
  SELECT COUNT(*) INTO policies_count
  FROM pg_policies 
  WHERE tablename = 'profiles' AND schemaname = 'public';
  
  IF policies_count > 0 THEN
    result := result || 'Policies exist ✓ ';
  ELSE
    result := result || 'No policies ✗ ';
  END IF;
  
  -- Check if audit table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_access_log') THEN
    result := result || 'Audit table exists ✓ ';
  ELSE
    result := result || 'Audit table missing ✗ ';
  END IF;
  
  RETURN result || 'Setup complete.';
END;
$$;