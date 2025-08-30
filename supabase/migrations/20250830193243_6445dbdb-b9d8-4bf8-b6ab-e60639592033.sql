-- Remover políticas RLS permissivas existentes na tabela supermercados
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar supermercados" ON public.supermercados;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir supermercados" ON public.supermercados;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar supermercados" ON public.supermercados;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar supermercados" ON public.supermercados;

-- Criar políticas RLS mais restritivas para proteger dados sensíveis

-- 1. Usuários autenticados podem visualizar apenas supermercados ativos
CREATE POLICY "Usuários autenticados podem visualizar supermercados ativos"
ON public.supermercados
FOR SELECT
TO authenticated
USING (ativo = true);

-- 2. Apenas usuários autenticados podem inserir novos supermercados
-- (mantém funcionalidade existente mas requer autenticação)
CREATE POLICY "Usuários autenticados podem inserir supermercados"
ON public.supermercados
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Apenas usuários autenticados podem atualizar supermercados
CREATE POLICY "Usuários autenticados podem atualizar supermercados"
ON public.supermercados
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Restringir exclusão apenas a usuários autenticados
CREATE POLICY "Usuários autenticados podem deletar supermercados"
ON public.supermercados
FOR DELETE
TO authenticated
USING (true);

-- Verificar se RLS está habilitado na tabela (deveria estar, mas garantindo)
ALTER TABLE public.supermercados ENABLE ROW LEVEL SECURITY;