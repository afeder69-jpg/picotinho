-- Corrigir registros específicos com problemas de acentuação
UPDATE estoque_app 
SET produto_nome = 'AVEIA EM GRÃOS QUAKER'
WHERE produto_nome = 'AVEIA EM GÃOS QUAKER';

-- Atualizar também outros produtos com problemas similares
UPDATE estoque_app 
SET produto_nome = REPLACE(produto_nome, 'GÃOS', 'GRÃOS')
WHERE produto_nome LIKE '%GÃOS%';