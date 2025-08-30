-- Corrigir produtos manuais específicos que ficaram sem preço
-- Usando preços de referência razoáveis baseados nos preços atuais

-- Corrigir BANANA D'ÁGUA com preço médio de banana baseado nos preços atuais
UPDATE estoque_app 
SET preco_unitario_ultimo = 6.99,
    updated_at = now()
WHERE produto_nome = 'BANANA DÁGUA' 
  AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0)
  AND NOT EXISTS (
    SELECT 1 FROM notas_imagens ni 
    WHERE ni.dados_extraidos::text LIKE '%BANANA%'
    AND ni.processada = true
    AND ni.usuario_id = estoque_app.user_id
  );

-- Log da correção para verificação
SELECT 
  id,
  produto_nome,
  quantidade,
  preco_unitario_ultimo,
  (quantidade * preco_unitario_ultimo) as subtotal
FROM estoque_app 
WHERE produto_nome = 'BANANA DÁGUA';