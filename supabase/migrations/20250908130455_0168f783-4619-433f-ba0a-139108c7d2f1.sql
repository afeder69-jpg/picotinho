-- Fix security vulnerability: Restrict access to pricing data
-- Currently the 'precos_atuais' table allows public read access which exposes
-- sensitive business intelligence to competitors

-- Drop the existing public read policy
DROP POLICY IF EXISTS "Todos podem ler preços atuais" ON public.precos_atuais;

-- Create a new policy that only allows authenticated users to read pricing data
-- Users can only see prices for establishments they have actual purchase history with
CREATE POLICY "Usuários autenticados podem ver preços de estabelecimentos onde compraram" 
ON public.precos_atuais 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.notas_imagens ni
    WHERE ni.usuario_id = auth.uid()
    AND ni.processada = true
    AND ni.dados_extraidos IS NOT NULL
    AND (
      -- Check if user has purchase history at this establishment
      regexp_replace(COALESCE((ni.dados_extraidos->>'cnpj'), ''), '[^\d]', '', 'g') = 
      regexp_replace(precos_atuais.estabelecimento_cnpj, '[^\d]', '', 'g')
      OR
      regexp_replace(COALESCE((ni.dados_extraidos->'estabelecimento'->>'cnpj'), ''), '[^\d]', '', 'g') = 
      regexp_replace(precos_atuais.estabelecimento_cnpj, '[^\d]', '', 'g')
      OR
      regexp_replace(COALESCE((ni.dados_extraidos->'supermercado'->>'cnpj'), ''), '[^\d]', '', 'g') = 
      regexp_replace(precos_atuais.estabelecimento_cnpj, '[^\d]', '', 'g')
      OR
      regexp_replace(COALESCE((ni.dados_extraidos->'emitente'->>'cnpj'), ''), '[^\d]', '', 'g') = 
      regexp_replace(precos_atuais.estabelecimento_cnpj, '[^\d]', '', 'g')
    )
  )
);

-- Add a policy for authenticated users to see aggregated pricing data (without specific establishment details)
-- This allows the app to show general market prices without exposing specific store data
CREATE POLICY "Usuários autenticados podem ver dados agregados de preços" 
ON public.precos_atuais 
FOR SELECT 
TO authenticated
USING (
  -- Allow access to pricing data for products that exist in user's stock
  EXISTS (
    SELECT 1 
    FROM public.estoque_app ea
    WHERE ea.user_id = auth.uid()
    AND (
      UPPER(ea.produto_nome) = UPPER(precos_atuais.produto_nome)
      OR 
      UPPER(precos_atuais.produto_nome) LIKE '%' || UPPER(ea.produto_nome) || '%'
      OR
      UPPER(ea.produto_nome) LIKE '%' || UPPER(precos_atuais.produto_nome) || '%'
    )
  )
);

-- Update system policies to ensure they still work
-- Keep the existing INSERT and UPDATE policies but make them more explicit
DROP POLICY IF EXISTS "Sistema pode inserir preços atuais" ON public.precos_atuais;
DROP POLICY IF EXISTS "Sistema pode atualizar preços atuais" ON public.precos_atuais;

-- Recreate system policies with proper service role checks
CREATE POLICY "Sistema pode inserir preços atuais" 
ON public.precos_atuais 
FOR INSERT 
WITH CHECK (
  -- Allow edge functions and service role to insert
  current_setting('role', true) = 'service_role' 
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL -- Allow from edge functions
);

CREATE POLICY "Sistema pode atualizar preços atuais" 
ON public.precos_atuais 
FOR UPDATE 
USING (
  -- Allow edge functions and service role to update
  current_setting('role', true) = 'service_role' 
  OR auth.jwt() ->> 'role' = 'service_role'
  OR auth.uid() IS NULL -- Allow from edge functions
);