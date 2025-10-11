-- Remover foreign key problemática que aponta para estoque_app
ALTER TABLE receita_ingredientes 
DROP CONSTRAINT IF EXISTS receita_ingredientes_produto_id_fkey;

-- Adicionar comentário explicativo
COMMENT ON COLUMN receita_ingredientes.produto_id IS 
  'ID opcional do produto master global - mantido para referência futura mas não obrigatório';