ALTER TABLE listas_compras DROP CONSTRAINT IF EXISTS listas_compras_origem_check;
ALTER TABLE listas_compras ADD CONSTRAINT listas_compras_origem_check 
  CHECK (origem IN ('manual', 'receita', 'cardapio', 'whatsapp'));