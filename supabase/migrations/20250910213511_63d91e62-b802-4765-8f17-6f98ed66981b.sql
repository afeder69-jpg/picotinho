-- Corrigir produtos inseridos manualmente mas marcados como 'nota_fiscal'
-- Identificar produtos recentes que não aparecem em nenhuma nota fiscal processada

UPDATE estoque_app 
SET origem = 'manual' 
WHERE origem = 'nota_fiscal' 
  AND created_at > NOW() - INTERVAL '2 hours'  -- Últimas 2 horas
  AND NOT EXISTS (
    -- Verificar se o produto NÃO está em nenhuma nota fiscal processada
    SELECT 1 FROM notas_imagens ni 
    WHERE ni.usuario_id = estoque_app.user_id 
      AND ni.processada = true 
      AND ni.dados_extraidos IS NOT NULL
      AND (
        -- Buscar o produto nos dados extraídos da nota
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(ni.dados_extraidos->'itens') as item
          WHERE UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(estoque_app.produto_nome))
        )
      )
  );