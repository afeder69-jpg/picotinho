-- Fix security vulnerability: Secure profiles table and personal information
-- Ensure only users can access their own profile data

-- First, check and strengthen existing RLS policies on profiles table
-- Drop existing policies to recreate them with stronger security
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem inserir seu próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.profiles;

-- Create secure RLS policies with proper validation
-- Users can only view their own profile
CREATE POLICY "Users can view only their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can only insert their own profile
CREATE POLICY "Users can insert only their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can only update their own profile
CREATE POLICY "Users can update only their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Block profile deletion for data integrity
CREATE POLICY "Block profile deletion"
ON public.profiles
FOR DELETE
TO authenticated
USING (false);

-- Create a security function to safely get public profile info (name only)
-- This allows showing user names in app features without exposing sensitive data
CREATE OR REPLACE FUNCTION public.get_public_profile_info(target_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  nome character varying
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.nome
  FROM profiles p
  WHERE p.user_id = target_user_id
  AND p.user_id IS NOT NULL;
$$;

-- Grant execute permission to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_public_profile_info(uuid) TO authenticated;

-- Ensure RLS is enabled on the profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Revoke any public access that might exist
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM public;

-- Grant only necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;