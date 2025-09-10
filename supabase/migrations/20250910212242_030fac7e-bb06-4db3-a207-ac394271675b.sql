-- Corrigir produtos que foram inseridos manualmente mas estão marcados como "nota_fiscal"
-- Identifica produtos que têm valor exato (como 5.00) e foram criados recentemente
-- sem estar associados a uma nota fiscal processada

UPDATE estoque_app 
SET origem = 'manual' 
WHERE origem = 'nota_fiscal' 
  AND preco_unitario_ultimo IN (5, 10, 15, 20, 25, 30) -- Valores "redondos" típicos de inserção manual
  AND NOT EXISTS (
    -- Verifica se o produto NÃO está em nenhuma nota fiscal processada
    SELECT 1 FROM notas_imagens ni 
    WHERE ni.usuario_id = estoque_app.user_id 
      AND ni.processada = true 
      AND ni.dados_extraidos IS NOT NULL
      AND (
        ni.dados_extraidos::text LIKE '%' || estoque_app.produto_nome || '%'
        OR ni.dados_extraidos::text LIKE '%' || REPLACE(estoque_app.produto_nome, ' ', '%') || '%'
      )
  );

-- Corrigir especificamente o SABÃO PEDRA recém inserido
UPDATE estoque_app 
SET origem = 'manual' 
WHERE produto_nome = 'SABÃO PEDRA' 
  AND preco_unitario_ultimo = 5 
  AND created_at > '2025-09-10 21:00:00';