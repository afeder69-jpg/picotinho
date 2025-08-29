-- Correção de segurança: Restringir acesso à tabela supermercados apenas para usuários autenticados
-- Remove a política pública existente
DROP POLICY IF EXISTS "Todos podem visualizar supermercados" ON public.supermercados;

-- Cria nova política que restringe acesso apenas a usuários autenticados
CREATE POLICY "Usuários autenticados podem visualizar supermercados" 
ON public.supermercados 
FOR SELECT 
TO authenticated
USING (true);

-- Política para permitir que usuários autenticados insiram novos supermercados
CREATE POLICY "Usuários autenticados podem inserir supermercados"
ON public.supermercados
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para permitir que usuários autenticados atualizem supermercados
CREATE POLICY "Usuários autenticados podem atualizar supermercados"
ON public.supermercados
FOR UPDATE
TO authenticated
USING (true);

-- Política para permitir que usuários autenticados deletem supermercados (se necessário)
CREATE POLICY "Usuários autenticados podem deletar supermercados"
ON public.supermercados
FOR DELETE
TO authenticated
USING (true);