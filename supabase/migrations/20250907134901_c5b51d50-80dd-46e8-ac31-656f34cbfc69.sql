-- Remover registro inválido inserido erroneamente na tabela precos_atuais
-- Este produto não existe no estoque nem em notas fiscais válidas

DELETE FROM precos_atuais 
WHERE produto_nome = 'CEBOLA ROXA KG GRANEL' 
AND estabelecimento_cnpj = '00000000000000';