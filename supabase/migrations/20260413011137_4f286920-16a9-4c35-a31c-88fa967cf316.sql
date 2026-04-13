CREATE POLICY "Usuarios autenticados podem ler produtos master ativos"
ON public.produtos_master_global
FOR SELECT
TO authenticated
USING (status = 'ativo');