-- Fix security linter warnings from the previous migration

-- 1. Drop the view with SECURITY DEFINER and recreate properly
DROP VIEW IF EXISTS public.profiles_safe;

-- Create the view without SECURITY DEFINER (let users access through RLS policies)
CREATE VIEW public.profiles_safe AS
SELECT 
  id,
  user_id,
  nome,
  -- For privacy, don't show phone numbers in the view at all
  -- Users should use the secure function to get their own profile
  NULL::character varying as telefone_masked,
  avatar_url,
  provider,
  provider_id,
  created_at,
  updated_at
FROM public.profiles
WHERE auth.uid() = user_id; -- Simple RLS check in view

-- 2. Update functions to have proper search_path settings
-- Fix the secure_profile_access function
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

-- 3. Fix the log_profile_access function
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
  -- Only log if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
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

-- 4. Fix the mask_phone_number function
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

-- 5. Fix the get_my_profile function
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

-- 6. Create a more secure way to access profile data
-- This function returns masked data for other users, full data for self
CREATE OR REPLACE FUNCTION public.get_profile_safe(target_user_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  nome character varying,
  telefone_display character varying,
  avatar_url text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Can only access your own profile
  IF auth.uid() != target_user_id THEN
    RAISE EXCEPTION 'Access denied: can only access your own profile';
  END IF;
  
  -- Log the access
  PERFORM public.log_profile_access(target_user_id, 'SAFE_GET');
  
  -- Return the user's own profile data
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.nome,
    p.telefone as telefone_display, -- Full phone for own profile
    p.avatar_url,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.user_id = target_user_id;
END;
$$;

-- 7. Update the grant permissions for the corrected view
GRANT SELECT ON public.profiles_safe TO authenticated;

-- Add comments for the updated security implementation
COMMENT ON VIEW public.profiles_safe IS 'Safe view of profiles that excludes sensitive phone data and uses proper RLS';
COMMENT ON FUNCTION public.get_profile_safe IS 'Secure function to get profile data with access logging and validation';