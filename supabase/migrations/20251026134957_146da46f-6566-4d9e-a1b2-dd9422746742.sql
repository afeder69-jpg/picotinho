-- Habilitar RLS na tabela nfe_cache_serpro
ALTER TABLE public.nfe_cache_serpro ENABLE ROW LEVEL SECURITY;

-- Política: Service role (edge functions) pode ler tudo
CREATE POLICY "Service role pode ler cache NFe"
ON public.nfe_cache_serpro
FOR SELECT
USING (
  (current_setting('role'::text, true) = 'service_role'::text) 
  OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  OR (auth.uid() IS NULL)
);

-- Política: Service role pode inserir
CREATE POLICY "Service role pode inserir cache NFe"
ON public.nfe_cache_serpro
FOR INSERT
WITH CHECK (
  (current_setting('role'::text, true) = 'service_role'::text) 
  OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  OR (auth.uid() IS NULL)
);

-- Política: Service role pode atualizar
CREATE POLICY "Service role pode atualizar cache NFe"
ON public.nfe_cache_serpro
FOR UPDATE
USING (
  (current_setting('role'::text, true) = 'service_role'::text) 
  OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  OR (auth.uid() IS NULL)
);

-- Usuários não podem deletar cache (só service role via edge functions)
CREATE POLICY "Bloquear delete direto no cache NFe"
ON public.nfe_cache_serpro
FOR DELETE
USING (false);