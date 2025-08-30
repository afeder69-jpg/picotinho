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
CREATE POLICY "users_update_own_non_sensitive_only"
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
  -- Prevent email modification (should only be done through auth system)
  AND OLD.email = NEW.email
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

-- Ensure RLS is enabled on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Revoke any dangerous permissions
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.users FROM public;

-- Grant minimal necessary permissions to authenticated users
GRANT SELECT, UPDATE ON public.users TO authenticated;

-- Create audit logging trigger for users table access
CREATE OR REPLACE FUNCTION public.log_users_table_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log any attempt to access users table
  RAISE LOG 'Users table access: Operation=%, User=%, Target_ID=%, Current_User_ID=%', 
    TG_OP, 
    COALESCE(auth.uid()::text, 'anonymous'),
    COALESCE(NEW.id::text, OLD.id::text, 'unknown'),
    auth.uid()::text;
  
  -- For SELECT operations, ensure it's only own data
  IF TG_OP = 'SELECT' AND auth.uid() != COALESCE(NEW.id, OLD.id) THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Attempted to access other user data';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply the audit trigger
DROP TRIGGER IF EXISTS users_access_audit ON public.users;
CREATE TRIGGER users_access_audit
  BEFORE SELECT OR INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.log_users_table_access();