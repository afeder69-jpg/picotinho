-- Final fix: Remove view approach and use a function instead to avoid security definer issues

-- Drop the view completely
DROP VIEW IF EXISTS public.supermercados_publicos;

-- Remove the conflicting policy
DROP POLICY IF EXISTS "Todos podem ver informações básicas dos supermercados ativos" ON public.supermercados;

-- Create a secure function to get basic supermercado information
CREATE OR REPLACE FUNCTION public.get_supermercados_basicos()
RETURNS TABLE (
  id uuid,
  nome character varying,
  cnpj character varying,
  endereco text,
  cidade character varying,
  estado character varying,
  cep character varying,
  latitude numeric,
  longitude numeric,
  ativo boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.id,
    s.nome,
    s.cnpj,
    s.endereco,
    s.cidade,
    s.estado,
    s.cep,
    s.latitude,
    s.longitude,
    s.ativo,
    s.created_at,
    s.updated_at
  FROM supermercados s
  WHERE s.ativo = true;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_supermercados_basicos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supermercados_basicos() TO anon;