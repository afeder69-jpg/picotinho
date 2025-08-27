-- Consolidação manual específica para produtos GRAENC/GRANEL
DO $$
DECLARE
    rec RECORD;
    produto_granel RECORD;
    produto_graenc RECORD;
BEGIN
    -- Buscar pares de produtos com GRANEL e GRAENC
    FOR rec IN 
        SELECT DISTINCT 
            user_id,
            REGEXP_REPLACE(produto_nome, '\b(GRAENC|GRANEL)\b', '', 'gi') as base_name,
            categoria,
            unidade_medida
        FROM estoque_app 
        WHERE produto_nome ~* '\b(GRAENC|GRANEL)\b'
    LOOP
        -- Buscar versão GRANEL
        SELECT * INTO produto_granel
        FROM estoque_app 
        WHERE user_id = rec.user_id 
        AND categoria = rec.categoria
        AND unidade_medida = rec.unidade_medida
        AND produto_nome ~* (rec.base_name || '.*GRANEL')
        LIMIT 1;
        
        -- Buscar versão GRAENC
        SELECT * INTO produto_graenc
        FROM estoque_app 
        WHERE user_id = rec.user_id 
        AND categoria = rec.categoria  
        AND unidade_medida = rec.unidade_medida
        AND produto_nome ~* (rec.base_name || '.*GRAENC')
        LIMIT 1;
        
        -- Se encontrou ambos, consolidar
        IF produto_granel.id IS NOT NULL AND produto_graenc.id IS NOT NULL THEN
            -- Atualizar produto GRANEL com soma das quantidades
            UPDATE estoque_app 
            SET 
                quantidade = produto_granel.quantidade + produto_graenc.quantidade,
                preco_unitario_ultimo = GREATEST(produto_granel.preco_unitario_ultimo, produto_graenc.preco_unitario_ultimo),
                updated_at = now()
            WHERE id = produto_granel.id;
            
            -- Deletar produto GRAENC
            DELETE FROM estoque_app WHERE id = produto_graenc.id;
            
            RAISE NOTICE 'Consolidado: % + % -> %', 
                produto_granel.produto_nome, 
                produto_graenc.produto_nome,
                produto_granel.quantidade + produto_graenc.quantidade;
        END IF;
    END LOOP;
END $$;