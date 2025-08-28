-- Corrigir vulnerabilidade de segurança na tabela users (migração limpa)
-- Erro: política já existe, então vamos limpar e recriar adequadamente

-- Verificar estado atual
SELECT 
    policyname, 
    cmd, 
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public';

-- Limpar políticas existentes que podem estar inadequadas
DROP POLICY IF EXISTS "Bloquear criação direta de usuários" ON public.users;
DROP POLICY IF EXISTS "Bloquear exclusão direta de usuários" ON public.users;

-- Garantir que RLS está habilitado
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Criar política restritiva para INSERT - bloqueia completamente criação direta
CREATE POLICY "Usuários não podem criar registros diretamente" 
ON public.users 
FOR INSERT 
WITH CHECK (false);

-- Criar política restritiva para DELETE - bloqueia completamente exclusão direta  
CREATE POLICY "Usuários não podem deletar registros diretamente" 
ON public.users 
FOR DELETE 
USING (false);

-- As políticas existentes de SELECT e UPDATE já estão corretas:
-- - Usuários só podem ver seus próprios dados
-- - Usuários só podem atualizar seus próprios dados

-- Verificar resultado final
SELECT 
    policyname, 
    cmd, 
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public'
ORDER BY cmd;