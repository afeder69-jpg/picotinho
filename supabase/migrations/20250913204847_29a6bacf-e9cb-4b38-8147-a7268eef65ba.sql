-- Corrigir a data da nota do Torre & Cia que está incorreta
-- Buscar pela nota do Torre & Cia e atualizar a data_criacao para corresponder à data_emissao
UPDATE notas_imagens 
SET data_criacao = (dados_extraidos->'compra'->>'data_emissao')::timestamp with time zone
WHERE id = '0b39e303-3ead-4036-9ae9-e4e31b721e81'
  AND dados_extraidos->'estabelecimento'->>'nome' LIKE '%TORRE%'
  AND dados_extraidos->'compra'->>'data_emissao' IS NOT NULL;