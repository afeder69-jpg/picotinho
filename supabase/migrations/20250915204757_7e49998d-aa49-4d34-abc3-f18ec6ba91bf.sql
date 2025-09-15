-- CORREÇÃO ESPECÍFICA: Encontrar e corrigir views com SECURITY DEFINER

-- 1. Verificar se há views criadas por meio de funções SECURITY DEFINER
-- O problema pode estar em funções que retornam TABLE e são usadas como views

-- 2. Corrigir as funções relacionadas a profiles que podem estar sendo usadas como views
DROP FUNCTION IF EXISTS public.get_profile_safe();
DROP FUNCTION IF EXISTS public.get_my_profile();
DROP FUNCTION IF EXISTS public.get_profile_summary();

-- 3. Substituir por funções sem SECURITY DEFINER ou políticas RLS adequadas
-- Para profiles, usar RLS diretamente na tabela

-- 4. Verificar se há alguma view SQL que pode ter sido criada com SECURITY DEFINER
-- indiretamente através de CREATE VIEW ... AS SELECT FROM função_security_definer()

-- Consultar se há views que usam funções SECURITY DEFINER
SELECT 
  viewname,
  definition
FROM pg_views 
WHERE definition ILIKE '%get_my_profile%' 
   OR definition ILIKE '%get_profile%'
   OR definition ILIKE '%security%';