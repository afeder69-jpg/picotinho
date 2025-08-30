-- SECURITY FIX: Remove sensitive data from users table and improve security

-- First, check if there are any references to the users table
-- The users table appears to contain email and password data which should not be accessible

-- Step 1: Create a more secure approach - remove password storage from users table
-- Passwords should only be handled by Supabase Auth, not stored in custom tables

-- Remove the senha (password) column from users table since it's a security risk
ALTER TABLE public.users DROP COLUMN IF EXISTS senha;

-- Step 2: Strengthen RLS policies on users table
-- Replace existing policies with more restrictive ones

DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.users;
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.users;
DROP POLICY IF EXISTS "Usuários não podem criar registros diretamente" ON public.users;
DROP POLICY IF EXISTS "Usuários não podem deletar registros diretamente" ON public.users;

-- Create more secure policies that prevent any direct access to sensitive data
CREATE POLICY "Users can only read their own basic info"
ON public.users FOR SELECT
USING (auth.uid() = id AND auth.role() = 'authenticated');

CREATE POLICY "Users can only update their own non-sensitive info"
ON public.users FOR UPDATE
USING (auth.uid() = id AND auth.role() = 'authenticated')
WITH CHECK (auth.uid() = id AND auth.role() = 'authenticated');

-- Completely block INSERT and DELETE operations
CREATE POLICY "Block direct user creation"
ON public.users FOR INSERT
WITH CHECK (false);

CREATE POLICY "Block direct user deletion"
ON public.users FOR DELETE
USING (false);

-- Step 3: Add additional security function to validate access
CREATE OR REPLACE FUNCTION public.validate_user_access(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow access if the requesting user is the same as the target user
  -- and they are properly authenticated
  IF auth.uid() = user_uuid AND auth.role() = 'authenticated' THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Step 4: Create a secure view for user data that filters sensitive information
CREATE OR REPLACE VIEW public.users_safe AS
SELECT 
  id,
  nome,
  created_at
FROM public.users
WHERE auth.uid() = id;

-- Enable RLS on the view
ALTER VIEW public.users_safe SET (security_invoker = on);

-- Step 5: Add row-level security to ensure email data is protected
-- If email is needed, it should come from auth.users via a secure function
CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(auth.email(), '');
$$;

-- Comment the security improvements
COMMENT ON FUNCTION public.validate_user_access(uuid) IS 'Security function to validate user access permissions';
COMMENT ON FUNCTION public.get_user_email() IS 'Secure function to get current user email from auth system';
COMMENT ON VIEW public.users_safe IS 'Secure view of users table with sensitive data filtered out';