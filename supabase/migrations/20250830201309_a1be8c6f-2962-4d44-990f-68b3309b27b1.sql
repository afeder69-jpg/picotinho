-- Fix security vulnerability: Restrict access to supermercados sensitive data
-- Only allow users to see full details of supermercados they have purchased from

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar supermercados ativos" ON public.supermercados;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar supermercados" ON public.supermercados;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar supermercados" ON public.supermercados;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir supermercados" ON public.supermercados;

-- Create secure policies: Users can only see full details of supermercados they have shopped at
CREATE POLICY "Usuários podem ver supermercados onde compraram"
ON public.supermercados
FOR SELECT
USING (
  ativo = true AND (
    -- Users can see full details only for supermercados they have purchased from
    EXISTS (
      SELECT 1 FROM compras_app 
      WHERE compras_app.supermercado_id = supermercados.id 
      AND compras_app.user_id = auth.uid()
    )
  )
);

-- System/admin operations (restrict to service role only)
CREATE POLICY "Sistema pode gerenciar supermercados"
ON public.supermercados
FOR ALL
USING (current_setting('role', true) = 'service_role')
WITH CHECK (current_setting('role', true) = 'service_role');

-- Create a public view for basic supermercado information without sensitive data
CREATE OR REPLACE VIEW public.supermercados_publicos AS
SELECT 
  id,
  nome,
  cnpj,
  endereco,
  cidade,
  estado,
  cep,
  latitude,
  longitude,
  ativo,
  created_at,
  updated_at
FROM public.supermercados
WHERE ativo = true;

-- Grant necessary permissions on the view
GRANT SELECT ON public.supermercados_publicos TO authenticated;
GRANT SELECT ON public.supermercados_publicos TO anon;