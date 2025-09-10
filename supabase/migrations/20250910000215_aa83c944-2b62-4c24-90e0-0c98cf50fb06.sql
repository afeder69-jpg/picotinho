-- Adicionar campo origem na tabela estoque_app para identificar produtos manuais
ALTER TABLE estoque_app ADD COLUMN origem VARCHAR(20) DEFAULT 'nota_fiscal';

-- Marcar o produto atual como manual
UPDATE estoque_app 
SET origem = 'manual' 
WHERE produto_nome = 'CHECAR MILAO';

-- Comentário: Agora todos os produtos inseridos via nota fiscal terão origem='nota_fiscal'
-- e produtos inseridos manualmente terão origem='manual'