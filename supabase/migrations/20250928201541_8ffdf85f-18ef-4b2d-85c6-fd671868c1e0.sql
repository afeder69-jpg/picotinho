-- Adicionar políticas RLS para permitir validação global de duplicatas
-- Estas políticas permitem que o service_role (usado pela IA-1) veja TODOS os registros
-- para detectar duplicatas globalmente entre todos os usuários

-- Política para notas_imagens - service_role pode ver todos os registros
CREATE POLICY "Service role pode ver todas as notas de imagem para validação"
ON public.notas_imagens
FOR SELECT
TO service_role
USING (true);

-- Política para notas_fiscais - service_role pode ver todos os registros  
CREATE POLICY "Service role pode ver todas as notas fiscais para validação"
ON public.notas_fiscais
FOR SELECT
TO service_role
USING (true);

-- Política para compras_app - service_role pode ver todos os registros
CREATE POLICY "Service role pode ver todas as compras para validação"
ON public.compras_app
FOR SELECT
TO service_role
USING (true);