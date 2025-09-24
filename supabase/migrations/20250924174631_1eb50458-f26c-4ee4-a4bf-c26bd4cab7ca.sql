-- Fix Security Issue: Restrict normalizacoes_log table access to user's own data only

-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Sistema pode ler logs" ON public.normalizacoes_log;

-- Create a secure policy that only allows users to see their own logs
CREATE POLICY "Usuários podem ver apenas seus próprios logs"
  ON public.normalizacoes_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Keep system INSERT access but ensure it's more restrictive
DROP POLICY IF EXISTS "Sistema pode inserir logs" ON public.normalizacoes_log;

CREATE POLICY "Sistema pode inserir logs autenticados"
  ON public.normalizacoes_log
  FOR INSERT
  WITH CHECK (
    -- Allow system/service role OR authenticated users inserting their own data
    (current_setting('role', true) = 'service_role') 
    OR (auth.uid() = user_id AND auth.uid() IS NOT NULL)
  );

-- Block direct updates and deletes for security
CREATE POLICY "Bloquear atualizações diretas nos logs"
  ON public.normalizacoes_log
  FOR UPDATE
  USING (false);

CREATE POLICY "Bloquear exclusões diretas nos logs"
  ON public.normalizacoes_log
  FOR DELETE
  USING (false);