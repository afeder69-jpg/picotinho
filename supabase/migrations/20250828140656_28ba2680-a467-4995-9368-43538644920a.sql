-- Corrigir vulnerabilidade de segurança na tabela users
-- Adicionar políticas RLS abrangentes para todas as operações

-- Verificar estado atual das políticas
SELECT 
    policyname, 
    cmd, 
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public';

-- Verificar se RLS está habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'users' AND schemaname = 'public';

-- Garantir que RLS está habilitado
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Remover qualquer política insegura que possa existir
DROP POLICY IF EXISTS "Anyone can create users" ON public.users;
DROP POLICY IF EXISTS "Public access to users" ON public.users;
DROP POLICY IF EXISTS "Allow all operations" ON public.users;

-- Bloquear INSERT completamente - usuários devem ser criados apenas pelo sistema de auth
-- A tabela users não deve permitir INSERT direto por usuários
CREATE POLICY "Bloquear criação direta de usuários" 
ON public.users 
FOR INSERT 
WITH CHECK (false);

-- Bloquear DELETE completamente - usuários não devem ser deletados diretamente
-- Deve ser feito através do sistema de auth do Supabase
CREATE POLICY "Bloquear exclusão direta de usuários" 
ON public.users 
FOR DELETE 
USING (false);

-- Verificar se as políticas existentes de SELECT e UPDATE estão seguras
-- Elas já existem e parecem corretas:
-- - "Usuários podem ver seu próprio perfil" (SELECT usando auth.uid() = id)
-- - "Usuários podem atualizar seu próprio perfil" (UPDATE usando auth.uid() = id)

-- Adicionar logging para auditoria de tentativas de acesso
CREATE OR REPLACE FUNCTION public.log_user_access_attempt()
RETURNS TRIGGER AS $$
BEGIN
    -- Log tentativas de INSERT ou DELETE não autorizadas
    RAISE LOG 'Tentativa de operação não autorizada na tabela users: %, User ID: %', 
        TG_OP, COALESCE(auth.uid()::text, 'não autenticado');
    RETURN NULL; -- Bloqueia a operação
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar triggers para logging de segurança
DROP TRIGGER IF EXISTS trigger_log_user_insert ON public.users;
CREATE TRIGGER trigger_log_user_insert
    BEFORE INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.log_user_access_attempt();

DROP TRIGGER IF EXISTS trigger_log_user_delete ON public.users;
CREATE TRIGGER trigger_log_user_delete
    BEFORE DELETE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.log_user_access_attempt();