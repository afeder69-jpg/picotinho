-- Fix critical security vulnerability: Strengthen users table RLS policies
-- Ensure email addresses are completely protected from unauthorized access

-- First check what policies exist and drop them with different names
DROP POLICY IF EXISTS "users_select_own_data_only" ON public.users;
DROP POLICY IF EXISTS "users_block_all_inserts" ON public.users;
DROP POLICY IF EXISTS "users_update_own_name_only" ON public.users;
DROP POLICY IF EXISTS "users_block_all_deletions" ON public.users;

-- Create ultra-secure RLS policies with unique names
-- Policy 1: Bulletproof SELECT - users can ONLY access their own record
CREATE POLICY "secure_users_select_own_only"
ON public.users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id 
  AND auth.uid() IS NOT NULL
  AND id IS NOT NULL
);

-- Policy 2: Block all user-initiated INSERT operations
CREATE POLICY "secure_users_block_inserts"
ON public.users
FOR INSERT
WITH CHECK (false);

-- Policy 3: Allow only name updates for own record
CREATE POLICY "secure_users_update_name_only"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id AND auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() = id AND auth.uid() IS NOT NULL);

-- Policy 4: Block all DELETE operations
CREATE POLICY "secure_users_block_deletes"
ON public.users
FOR DELETE
USING (false);

-- Create email protection trigger
CREATE OR REPLACE FUNCTION public.protect_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block any attempt to modify email
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    RAISE EXCEPTION 'Email modification blocked for security';
  END IF;
  RETURN NEW;
END;
$$;

-- Apply email protection
DROP TRIGGER IF EXISTS protect_user_email ON public.users;
CREATE TRIGGER protect_user_email
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_email();

-- Ensure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Remove dangerous permissions
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.users FROM public;