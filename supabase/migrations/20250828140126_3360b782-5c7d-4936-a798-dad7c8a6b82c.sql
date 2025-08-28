-- Fix critical security vulnerability in notas table
-- Currently anyone can read all receipt data, exposing customer shopping patterns

-- First, add user_id column to associate receipts with users
ALTER TABLE public.notas 
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Update existing records to have a user_id (set to null for now, will need manual cleanup)
-- In production, you'd want to associate existing records with proper users

-- Drop the overly permissive public policies
DROP POLICY IF EXISTS "Anyone can view notas" ON public.notas;
DROP POLICY IF EXISTS "Anyone can update notas" ON public.notas;
DROP POLICY IF EXISTS "Anyone can create notas" ON public.notas;

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

-- Make user_id required for new records (after adding the column)
ALTER TABLE public.notas 
ALTER COLUMN user_id SET NOT NULL;