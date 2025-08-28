-- Analisar e corrigir políticas RLS da tabela users
-- Primeiro, verificar se RLS está habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'users' AND schemaname = 'public';

-- Verificar políticas existentes
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public';

-- Remover qualquer política que permita acesso público
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Allow public read access" ON public.users;
DROP POLICY IF EXISTS "Public read access" ON public.users;

-- Garantir que RLS está habilitado
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Recriar políticas seguras - usuários só podem ver seus próprios dados
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.users;
CREATE POLICY "Usuários podem ver seu próprio perfil" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

-- Política para atualização (já existe mas vamos recriar para garantir)
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.users;
CREATE POLICY "Usuários podem atualizar seu próprio perfil" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Garantir que não há políticas de INSERT ou DELETE públicas
-- (essas operações devem ser bloqueadas para esta tabela)

-- Verificar novamente as políticas após a correção
SELECT 
    policyname, 
    cmd, 
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public';