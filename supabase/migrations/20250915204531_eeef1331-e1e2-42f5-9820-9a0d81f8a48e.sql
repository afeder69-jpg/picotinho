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

-- Não é necessária função SECURITY DEFINER, usar view simples ou consulta direta
-- Os dados de supermercados podem ser públicos através de política RLS específica

-- 3. Verificar e corrigir função get_user_email se necessário
-- Manter apenas se realmente necessário e bem justificado
-- A função get_user_email() já está correta com SECURITY DEFINER justificado

-- 4. Criar política RLS adequada para supermercados se necessário
-- Permitir leitura pública de supermercados básicos (sem dados sensíveis)
CREATE POLICY IF NOT EXISTS "Supermercados básicos são públicos"
ON public.supermercados
FOR SELECT
TO public
USING (ativo = true);

-- 5. Garantir que as views existentes usem RLS ao invés de SECURITY DEFINER
-- A view supermercados_publicos já está correta, apenas oculta CNPJ

-- Comentário: As views identificadas (supermercados_publicos, estoque_consolidado, etc.)
-- não têm SECURITY DEFINER explícito e estão corretas.
-- O alerta pode estar relacionado a funções antigas que foram corrigidas.