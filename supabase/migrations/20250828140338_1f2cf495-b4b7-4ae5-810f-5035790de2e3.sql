-- Fix critical security vulnerability in notas table
-- Step 1: Add user_id column (nullable first)
ALTER TABLE public.notas 
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Step 2: For existing records without user_id, we need to either:
-- Option A: Delete orphaned records (safest for security)
-- Option B: Associate with a default user (if you have one)
-- Let's go with Option A for maximum security

-- Drop the overly permissive public policies first
DROP POLICY IF EXISTS "Anyone can view notas" ON public.notas;
DROP POLICY IF EXISTS "Anyone can update notas" ON public.notas;
DROP POLICY IF EXISTS "Anyone can create notas" ON public.notas;

-- Delete records that can't be associated with users (security cleanup)
DELETE FROM public.notas WHERE user_id IS NULL;

-- Now make user_id required
ALTER TABLE public.notas 
ALTER COLUMN user_id SET NOT NULL;

-- Create secure user-based RLS policies
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