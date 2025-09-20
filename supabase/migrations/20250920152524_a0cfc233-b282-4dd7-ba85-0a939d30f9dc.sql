-- Remover a constraint restritiva atual
ALTER TABLE estoque_app DROP CONSTRAINT IF EXISTS check_categoria_valida;

-- Criar nova constraint mais permissiva que aceita as categorias da IA-2
ALTER TABLE estoque_app ADD CONSTRAINT check_categoria_valida 
CHECK (categoria IN (
  'MERCEARIA', 'LIMPEZA', 'HIGIENE', 'BEBIDAS', 'LATICÍNIOS', 'PADARIA', 'AÇOUGUE', 'HORTIFRUTI', 'FRIOS', 'OUTROS',
  'Outros', 'Laticínios', 'Hortifruti', 'Carnes', 'Limpeza', 'Bebidas', 'Mercearia',
  'LATICÍNIOS/FRIOS', 'AÇOUGUE', 'CARNES'
));