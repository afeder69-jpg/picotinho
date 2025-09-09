-- Limpar produtos que foram marcados incorretamente como 'manual'
-- quando na verdade vieram de notas fiscais
DELETE FROM precos_atuais_usuario 
WHERE origem = 'manual'
AND EXISTS (
    SELECT 1 FROM notas_imagens ni 
    WHERE ni.processada = true
    AND ni.dados_extraidos IS NOT NULL
    AND (
        -- Buscar no array de itens
        EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(ni.dados_extraidos->'itens', '[]'::jsonb)) as item
            WHERE UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(precos_atuais_usuario.produto_nome))
               OR UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(precos_atuais_usuario.produto_nome)) || '%'
               OR UPPER(TRIM(precos_atuais_usuario.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
        )
        OR
        -- Buscar no array de produtos 
        EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(ni.dados_extraidos->'produtos', '[]'::jsonb)) as produto
            WHERE UPPER(TRIM(COALESCE(produto->>'nome', ''))) = UPPER(TRIM(precos_atuais_usuario.produto_nome))
               OR UPPER(TRIM(COALESCE(produto->>'nome', ''))) LIKE '%' || UPPER(TRIM(precos_atuais_usuario.produto_nome)) || '%'
               OR UPPER(TRIM(precos_atuais_usuario.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(produto->>'nome', ''))) || '%'
        )
    )
    AND ni.usuario_id = precos_atuais_usuario.user_id
);