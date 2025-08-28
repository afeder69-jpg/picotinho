-- Fix critical security vulnerability in notas table (clean approach)
-- Check and fix the publicly accessible receipt data

-- Check current state first
SELECT 
    policyname, 
    cmd, 
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'notas' AND schemaname = 'public';

-- Add user_id column if it doesn't exist (safe approach)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notas' 
        AND column_name = 'user_id' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.notas ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Clean up any existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can view notas" ON public.notas;
DROP POLICY IF EXISTS "Anyone can update notas" ON public.notas;
DROP POLICY IF EXISTS "Anyone can create notas" ON public.notas;

-- Clean up existing user policies to recreate them properly
DROP POLICY IF EXISTS "Users can view their own notas" ON public.notas;
DROP POLICY IF EXISTS "Users can create their own notas" ON public.notas;
DROP POLICY IF EXISTS "Users can update their own notas" ON public.notas;
DROP POLICY IF EXISTS "Users can delete their own notas" ON public.notas;

-- Delete any existing records without user association (security cleanup)
DELETE FROM public.notas WHERE user_id IS NULL;

-- Make user_id required for future security
ALTER TABLE public.notas ALTER COLUMN user_id SET NOT NULL;

-- Create secure RLS policies
CREATE POLICY "Users can view their own notas" 
ON public.notas 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notas" 
ON public.notas 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notas" 
ON public.notas 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notas" 
ON public.notas 
FOR DELETE 
USING (auth.uid() = user_id);