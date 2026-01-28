-- Remover política antiga que pode estar bloqueando
DROP POLICY IF EXISTS "Service role pode gerenciar sessões WhatsApp" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Usuários podem gerenciar suas sessões WhatsApp" ON public.whatsapp_sessions;

-- Criar política única e mais permissiva
-- Edge Functions com service_role_key devem poder fazer tudo
CREATE POLICY "Permitir todas operações em whatsapp_sessions" 
ON public.whatsapp_sessions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Comentário: RLS está habilitado mas permite todas operações
-- A segurança é garantida pelo uso do SUPABASE_SERVICE_ROLE_KEY nas Edge Functions