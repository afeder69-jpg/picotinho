-- nfce_cache_infosimples: DROP and recreate SELECT, INSERT, UPDATE policies without anon access
DROP POLICY "Service role pode ler cache NFC-e InfoSimples" ON public.nfce_cache_infosimples;
CREATE POLICY "Service role pode ler cache NFC-e InfoSimples" ON public.nfce_cache_infosimples
  FOR SELECT USING (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY "Service role pode inserir cache NFC-e InfoSimples" ON public.nfce_cache_infosimples;
CREATE POLICY "Service role pode inserir cache NFC-e InfoSimples" ON public.nfce_cache_infosimples
  FOR INSERT WITH CHECK (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY "Service role pode atualizar cache NFC-e InfoSimples" ON public.nfce_cache_infosimples;
CREATE POLICY "Service role pode atualizar cache NFC-e InfoSimples" ON public.nfce_cache_infosimples
  FOR UPDATE USING (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- nfe_cache_serpro: DROP and recreate SELECT, INSERT, UPDATE policies without anon access
DROP POLICY "Service role pode ler cache NFe" ON public.nfe_cache_serpro;
CREATE POLICY "Service role pode ler cache NFe" ON public.nfe_cache_serpro
  FOR SELECT USING (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY "Service role pode inserir cache NFe" ON public.nfe_cache_serpro;
CREATE POLICY "Service role pode inserir cache NFe" ON public.nfe_cache_serpro
  FOR INSERT WITH CHECK (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY "Service role pode atualizar cache NFe" ON public.nfe_cache_serpro;
CREATE POLICY "Service role pode atualizar cache NFe" ON public.nfe_cache_serpro
  FOR UPDATE USING (
    current_setting('role'::text, true) = 'service_role'::text
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );