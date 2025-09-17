-- Excluir nota da SUPERDELLI e todos os resíduos relacionados

-- 1. Excluir da tabela notas_imagens
DELETE FROM notas_imagens 
WHERE dados_extraidos->'estabelecimento'->>'nome' ILIKE '%SUPERDELLI%'
   OR dados_extraidos->'supermercado'->>'nome' ILIKE '%SUPERDELLI%'
   OR dados_extraidos->'emitente'->>'nome' ILIKE '%SUPERDELLI%';

-- 2. Excluir produtos relacionados da SUPERDELLI do estoque
DELETE FROM estoque_app 
WHERE produto_nome IN (
  SELECT DISTINCT item->>'descricao'
  FROM notas_imagens ni,
  jsonb_array_elements(ni.dados_extraidos->'itens') as item
  WHERE ni.dados_extraidos->'estabelecimento'->>'nome' ILIKE '%SUPERDELLI%'
);

-- 3. Excluir preços da SUPERDELLI
DELETE FROM precos_atuais 
WHERE estabelecimento_nome ILIKE '%SUPERDELLI%'
   OR estabelecimento_cnpj = '39346861000175';

-- 4. Excluir preços de usuário relacionados à SUPERDELLI
DELETE FROM precos_atuais_usuario 
WHERE produto_nome IN (
  SELECT produto_nome 
  FROM precos_atuais 
  WHERE estabelecimento_nome ILIKE '%SUPERDELLI%'
);