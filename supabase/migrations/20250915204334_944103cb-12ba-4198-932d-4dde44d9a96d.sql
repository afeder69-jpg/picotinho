-- CORREÇÃO CRÍTICA DE SEGURANÇA: Remover acesso público aos números de telefone

-- 1. Remover a política vulnerável que expõe números de telefone publicamente
DROP POLICY IF EXISTS "Sistema pode validar telefones autorizados" ON public.whatsapp_telefones_autorizados;

-- 2. Criar políticas seguras que protegem os dados pessoais

-- Política para SELECT: Apenas o dono pode ver seus próprios telefones
CREATE POLICY "Usuários podem ver apenas seus próprios telefones"
ON public.whatsapp_telefones_autorizados
FOR SELECT
USING (auth.uid() = usuario_id);

-- Política para INSERT: Apenas o dono pode adicionar telefones para si mesmo
CREATE POLICY "Usuários podem adicionar seus próprios telefones"
ON public.whatsapp_telefones_autorizados
FOR INSERT
WITH CHECK (auth.uid() = usuario_id);

-- Política para UPDATE: Apenas o dono pode atualizar seus telefones
CREATE POLICY "Usuários podem atualizar seus próprios telefones"
ON public.whatsapp_telefones_autorizados
FOR UPDATE
USING (auth.uid() = usuario_id)
WITH CHECK (auth.uid() = usuario_id);

-- Política para DELETE: Apenas o dono pode deletar seus telefones
CREATE POLICY "Usuários podem deletar seus próprios telefones"
ON public.whatsapp_telefones_autorizados
FOR DELETE
USING (auth.uid() = usuario_id);

-- 3. Criar função SECURITY DEFINER para edge functions validarem telefones (se necessário)
-- Esta função permite que edge functions validem telefones sem expor dados sensíveis
CREATE OR REPLACE FUNCTION public.validar_telefone_whatsapp(telefone_numero text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retorna apenas se existe e está verificado, sem expor dados pessoais
  RETURN EXISTS (
    SELECT 1 
    FROM whatsapp_telefones_autorizados 
    WHERE numero_whatsapp = telefone_numero 
    AND verificado = true 
    AND ativo = true
  );
END;
$$;

-- 4. Revogar qualquer permissão pública restante na tabela
REVOKE ALL ON public.whatsapp_telefones_autorizados FROM anon;
REVOKE ALL ON public.whatsapp_telefones_autorizados FROM authenticated;