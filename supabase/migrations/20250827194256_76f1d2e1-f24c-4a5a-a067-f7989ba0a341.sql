-- Consolidação manual usando ORDER BY em vez de MIN para UUIDs
WITH consolidated_pao AS (
    SELECT 
        user_id,
        SUM(quantidade) as total_quantidade,
        MAX(preco_unitario_ultimo) as ultimo_preco,
        (array_agg(id ORDER BY created_at))[1] as id_principal
    FROM estoque_app 
    WHERE produto_nome ILIKE '%pao de forma%'
    GROUP BY user_id
)
UPDATE estoque_app 
SET 
    produto_nome = 'PAO DE FORMA',
    quantidade = consolidated_pao.total_quantidade,
    preco_unitario_ultimo = consolidated_pao.ultimo_preco,
    updated_at = now()
FROM consolidated_pao
WHERE estoque_app.id = consolidated_pao.id_principal;

-- Deletar os produtos duplicados
WITH consolidated_pao AS (
    SELECT 
        user_id,
        (array_agg(id ORDER BY created_at))[1] as id_principal
    FROM estoque_app 
    WHERE produto_nome ILIKE '%pao de forma%'
    GROUP BY user_id
)
DELETE FROM estoque_app 
WHERE produto_nome ILIKE '%pao de forma%' 
AND id NOT IN (SELECT id_principal FROM consolidated_pao);