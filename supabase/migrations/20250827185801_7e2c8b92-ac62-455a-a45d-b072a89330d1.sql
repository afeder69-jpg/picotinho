-- Função de consolidação manual específica para pães de forma
UPDATE estoque_app 
SET 
    produto_nome = 'PAO DE FORMA',
    quantidade = (
        SELECT SUM(quantidade) 
        FROM estoque_app 
        WHERE produto_nome ILIKE '%pao de forma%' 
        AND user_id = estoque_app.user_id
    ),
    preco_unitario_ultimo = (
        SELECT MAX(preco_unitario_ultimo) 
        FROM estoque_app 
        WHERE produto_nome ILIKE '%pao de forma%' 
        AND user_id = estoque_app.user_id
    ),
    updated_at = now()
WHERE id = (
    SELECT MIN(id) 
    FROM estoque_app 
    WHERE produto_nome ILIKE '%pao de forma%'
);

-- Deletar os produtos duplicados de pão de forma
DELETE FROM estoque_app 
WHERE produto_nome ILIKE '%pao de forma%' 
AND id != (
    SELECT MIN(id) 
    FROM estoque_app 
    WHERE produto_nome ILIKE '%pao de forma%'
);