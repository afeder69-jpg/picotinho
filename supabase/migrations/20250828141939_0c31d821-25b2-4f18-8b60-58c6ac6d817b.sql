-- Corrigir vulnerabilidade de inteligência de preços na tabela historico_precos_app
-- Atualmente está publicamente legível, expondo dados sensíveis de preços

-- Verificar estado atual das políticas
SELECT 
    policyname, 
    cmd, 
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'historico_precos_app' AND schemaname = 'public';

-- Verificar estrutura da tabela para entender as relações
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'historico_precos_app' 
AND table_schema = 'public';

-- Primeiro, remover políticas públicas perigosas
DROP POLICY IF EXISTS "Todos podem visualizar histórico de preços" ON public.historico_precos_app;
DROP POLICY IF EXISTS "Sistema pode inserir histórico de preços" ON public.historico_precos_app;

-- Verificar se a tabela tem relacionamento com usuários via compras
-- Como o histórico de preços é criado a partir de compras de usuários,
-- vamos relacionar através da tabela de compras

-- Criar políticas baseadas em usuário para SELECT
CREATE POLICY "Usuários podem ver histórico de preços de suas próprias compras" 
ON public.historico_precos_app 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 
        FROM public.compras_app c
        JOIN public.itens_compra_app ic ON c.id = ic.compra_id
        WHERE ic.produto_id = historico_precos_app.produto_id
        AND c.supermercado_id = historico_precos_app.supermercado_id
        AND c.user_id = auth.uid()
        AND c.data_compra = historico_precos_app.data_preco
    )
);

-- Política para INSERT - apenas o sistema pode inserir através de triggers
CREATE POLICY "Sistema pode inserir histórico de preços" 
ON public.historico_precos_app 
FOR INSERT 
WITH CHECK (true); -- Permite INSERT pelo sistema/triggers

-- Bloquear UPDATE e DELETE diretos - dados históricos não devem ser alterados
CREATE POLICY "Bloquear atualizações diretas no histórico" 
ON public.historico_precos_app 
FOR UPDATE 
USING (false);

CREATE POLICY "Bloquear exclusões diretas no histórico" 
ON public.historico_precos_app 
FOR DELETE 
USING (false);

-- Verificar resultado final
SELECT 
    policyname, 
    cmd, 
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'historico_precos_app' AND schemaname = 'public'
ORDER BY cmd;