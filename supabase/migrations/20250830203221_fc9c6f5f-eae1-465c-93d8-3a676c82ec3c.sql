-- Fix critical security vulnerability: Strengthen users table RLS policies
-- Ensure email addresses are completely protected from unauthorized access

-- Drop existing policies to recreate them with stronger security
DROP POLICY IF EXISTS "Users can only read their own basic info" ON public.users;
DROP POLICY IF EXISTS "Users can only update their own non-sensitive info" ON public.users;
DROP POLICY IF EXISTS "Block direct user creation" ON public.users;
DROP POLICY IF EXISTS "Block direct user deletion" ON public.users;

-- Create bulletproof RLS policies for the users table
-- Policy 1: Extremely restrictive SELECT - users can ONLY see their own record
CREATE POLICY "users_select_own_data_only"
ON public.users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id 
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND id IS NOT NULL
);

-- Policy 2: Block all INSERT operations (users should be created through auth system only)
CREATE POLICY "users_block_all_inserts"
ON public.users
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

-- Policy 3: Extremely restrictive UPDATE - users can only update their own non-email data
-- Remove email from updates by blocking it entirely through a separate policy
CREATE POLICY "users_update_own_name_only"
ON public.users
FOR UPDATE
TO authenticated
USING (
  auth.uid() = id 
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND id IS NOT NULL
)
WITH CHECK (
  auth.uid() = id 
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND id IS NOT NULL
);

-- Policy 4: Block all DELETE operations completely
CREATE POLICY "users_block_all_deletions"
ON public.users
FOR DELETE
TO authenticated, anon
USING (false);

-- Create a secure function for system operations that need to access user data
-- This function can only be called by the service role
CREATE OR REPLACE FUNCTION public.get_user_safe_info(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Only allow service role to execute this function
  SELECT 
    u.id,
    u.nome,
    u.created_at
  FROM users u
  WHERE u.id = target_user_id
  AND current_setting('role', true) = 'service_role';
$$;

-- Create a trigger to prevent email modifications
CREATE OR REPLACE FUNCTION public.prevent_email_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent any updates to email field by users
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Email updates are not allowed through this interface';
  END IF;
  
  -- Log the update attempt
  RAISE LOG 'Users table update: User=%, Updated_User_ID=%', 
    auth.uid()::text,
    NEW.id::text;
    
  RETURN NEW;
END;
$$;

-- Apply the email protection trigger
DROP TRIGGER IF EXISTS prevent_email_updates ON public.users;
CREATE TRIGGER prevent_email_updates
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_email_updates();

-- Ensure RLS is enabled on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Revoke any dangerous permissions
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.users FROM public;

-- Grant minimal necessary permissions to authenticated users
GRANT SELECT, UPDATE ON public.users TO authenticated;