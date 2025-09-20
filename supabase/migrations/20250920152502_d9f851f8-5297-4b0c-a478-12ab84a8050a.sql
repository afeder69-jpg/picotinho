-- Verificar as categorias válidas atualmente
SELECT constraint_name, constraint_definition 
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'estoque_app' AND tc.constraint_type = 'CHECK';

-- Remover a constraint restritiva atual
ALTER TABLE estoque_app DROP CONSTRAINT IF EXISTS check_categoria_valida;

-- Criar nova constraint mais permissiva que aceita as categorias da IA-2
ALTER TABLE estoque_app ADD CONSTRAINT check_categoria_valida 
CHECK (categoria IN (
  'MERCEARIA', 'LIMPEZA', 'HIGIENE', 'BEBIDAS', 'LATICÍNIOS', 'PADARIA', 'AÇOUGUE', 'HORTIFRUTI', 'FRIOS', 'OUTROS',
  'Outros', 'Laticínios', 'Hortifruti', 'Carnes', 'Limpeza', 'Bebidas', 'Mercearia',
  'LATICÍNIOS/FRIOS', 'AÇOUGUE', 'CARNES'
));