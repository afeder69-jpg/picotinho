-- Remover produtos específicos do estoque para teste de normalização
DELETE FROM estoque_app 
WHERE id IN ('ec91d8e6-7773-4255-99a1-06dea8a75c2c', '417da51b-3e67-40a6-82a1-3bf41e116da9');

-- Remover também de precos_atuais_usuario se existirem
DELETE FROM precos_atuais_usuario 
WHERE (produto_nome LIKE '%Creme Leite Italac%' OR produto_nome LIKE '%Chá Mate Matte Leão%' OR produto_nome LIKE '%Cha Mate Matte Leao%')
AND user_id = '1e601806-a7f2-4089-9519-cf65824a8f2f';