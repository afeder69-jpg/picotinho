-- CORREÇÃO: Security Definer View - Revisão e correção de funções problemáticas

-- 1. Verificar e corrigir a função get_my_profile_safe que pode estar gerando views
DROP FUNCTION IF EXISTS public.get_my_profile_safe();

-- Recriar sem SECURITY DEFINER desnecessário, usando RLS adequado
CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE(
  id uuid, 
  user_id uuid, 
  nome character varying, 
  telefone character varying, 
  avatar_url text, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE -- Removido SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar autenticação
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Retornar dados usando RLS ao invés de SECURITY DEFINER
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.nome,
    p.telefone,
    p.avatar_url,
    p.created_at,
    p.updated_at
  FROM profiles p
  WHERE p.user_id = auth.uid();
END;
$$;

-- 2. Corrigir get_supermercados_basicos para usar RLS
DROP FUNCTION IF EXISTS public.get_supermercados_basicos();

-- 3. Verificar se já existe política para supermercados e criar se necessário
DO $$
BEGIN
  -- Tentar criar política se não existir
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supermercados' 
    AND policyname = 'Supermercados básicos são públicos'
  ) THEN
    EXECUTE 'CREATE POLICY "Supermercados básicos são públicos" ON public.supermercados FOR SELECT TO public USING (ativo = true)';
  END IF;
END
$$;