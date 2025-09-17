-- Limpar produtos residuais do estoque que não aparecem nas notas fiscais ativas
DELETE FROM estoque_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
AND NOT EXISTS (
    -- Verificar se produto aparece em alguma nota fiscal ativa
    SELECT 1 FROM notas_imagens ni
    WHERE ni.usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
    AND ni.processada = true
    AND ni.dados_extraidos IS NOT NULL
    AND ni.excluida = false
    AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(ni.dados_extraidos->'itens') as item
        WHERE UPPER(TRIM(COALESCE(item->>'descricao', ''))) = UPPER(TRIM(estoque_app.produto_nome))
        OR UPPER(TRIM(COALESCE(item->>'descricao', ''))) LIKE '%' || UPPER(TRIM(estoque_app.produto_nome)) || '%'
        OR UPPER(TRIM(estoque_app.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', ''))) || '%'
    )
);