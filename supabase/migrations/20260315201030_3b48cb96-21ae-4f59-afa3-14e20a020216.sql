-- Remove the fully open policy
DROP POLICY "Permitir todas operações em whatsapp_sessions" ON public.whatsapp_sessions;

-- Only service_role can SELECT
CREATE POLICY "Service role pode ler sessões WhatsApp" ON public.whatsapp_sessions
  FOR SELECT USING (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Only service_role can INSERT
CREATE POLICY "Service role pode criar sessões WhatsApp" ON public.whatsapp_sessions
  FOR INSERT WITH CHECK (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Only service_role can UPDATE
CREATE POLICY "Service role pode atualizar sessões WhatsApp" ON public.whatsapp_sessions
  FOR UPDATE USING (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Only service_role can DELETE
CREATE POLICY "Service role pode deletar sessões WhatsApp" ON public.whatsapp_sessions
  FOR DELETE USING (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );