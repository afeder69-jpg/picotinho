-- Fix the security definer view issue
-- Replace the view with a regular view that uses RLS from the base table

-- Drop the problematic view
DROP VIEW IF EXISTS public.supermercados_publicos;

-- Recreate as a regular view without security definer
CREATE VIEW public.supermercados_publicos AS
SELECT 
  id,
  nome,
  cnpj,
  endereco,
  cidade,
  estado,
  cep,
  latitude,
  longitude,
  ativo,
  created_at,
  updated_at
FROM public.supermercados
WHERE ativo = true;

-- Create a specific RLS policy for the public view access
-- Allow all authenticated users to see basic supermercado info (without email/phone)
CREATE POLICY "Todos podem ver informações básicas dos supermercados ativos"
ON public.supermercados
FOR SELECT
USING (
  ativo = true AND (
    -- This policy is specifically for basic info access without sensitive data
    -- The view will filter out sensitive fields
    current_setting('request.jwt.claims', true) IS NOT NULL
  )
);

-- Grant permissions on the view
GRANT SELECT ON public.supermercados_publicos TO authenticated;
GRANT SELECT ON public.supermercados_publicos TO anon;