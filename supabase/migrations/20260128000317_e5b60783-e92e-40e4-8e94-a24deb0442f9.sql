-- Adicionar política para permitir service_role gerenciar sessões
DROP POLICY IF EXISTS "Service role pode gerenciar sessões WhatsApp" ON public.whatsapp_sessions;

CREATE POLICY "Service role pode gerenciar sessões WhatsApp" 
ON public.whatsapp_sessions 
FOR ALL 
USING (
  current_setting('role', true) = 'service_role' 
  OR (auth.jwt() ->> 'role') = 'service_role'
  OR auth.uid() IS NULL
)
WITH CHECK (
  current_setting('role', true) = 'service_role' 
  OR (auth.jwt() ->> 'role') = 'service_role'
  OR auth.uid() IS NULL
);