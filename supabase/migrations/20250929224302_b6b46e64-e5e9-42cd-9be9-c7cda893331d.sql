-- Criar política RLS para permitir leitura de categorias ativas
CREATE POLICY "Permitir leitura de categorias ativas" 
ON categorias 
FOR SELECT 
TO authenticated 
USING (ativa = true);