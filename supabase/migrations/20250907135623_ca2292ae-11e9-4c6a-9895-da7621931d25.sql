-- 1. Primeiro, limpar duplicatas existentes na tabela precos_atuais
WITH duplicatas AS (
  SELECT 
    produto_nome,
    estabelecimento_cnpj,
    MIN(id) as keep_id
  FROM precos_atuais 
  GROUP BY produto_nome, estabelecimento_cnpj
  HAVING COUNT(*) > 1
)
DELETE FROM precos_atuais 
WHERE id NOT IN (SELECT keep_id FROM duplicatas)
AND (produto_nome, estabelecimento_cnpj) IN (
  SELECT produto_nome, estabelecimento_cnpj 
  FROM duplicatas
);

-- 2. Criar constraint única para permitir upsert correto
ALTER TABLE precos_atuais 
ADD CONSTRAINT unique_produto_estabelecimento 
UNIQUE (produto_nome, estabelecimento_cnpj);

-- 3. Agora reprocessar a nota da COSTAZUL para inserir os preços faltantes
-- Buscar produtos da nota fiscal da COSTAZUL que não estão em precos_atuais
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_nome, 
  estabelecimento_cnpj,
  data_atualizacao
)
SELECT DISTINCT
  UPPER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          item->>'descricao',
          '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b', 
          'PAO DE FORMA', 'gi'
        ),
        '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL|\d+G|\d+ML|\d+L|\d+KG)\b', 
        '', 'gi'
      ),
      '\s+', ' ', 'g'
    )
  )) as produto_nome_normalizado,
  COALESCE((item->>'valor_unitario')::numeric, (item->>'preco_unitario')::numeric, 0) as valor_unitario,
  COALESCE(
    ni.dados_extraidos->'estabelecimento'->>'nome',
    ni.dados_extraidos->'supermercado'->>'nome',
    ni.dados_extraidos->'emitente'->>'nome',
    'COSTAZUL ALIMENTOS LTDA'
  ) as estabelecimento_nome,
  COALESCE(
    REGEXP_REPLACE(ni.dados_extraidos->'estabelecimento'->>'cnpj', '[^\d]', '', 'g'),
    REGEXP_REPLACE(ni.dados_extraidos->'supermercado'->>'cnpj', '[^\d]', '', 'g'),
    REGEXP_REPLACE(ni.dados_extraidos->'emitente'->>'cnpj', '[^\d]', '', 'g'),
    '17493338000397'
  ) as estabelecimento_cnpj,
  GREATEST(ni.created_at, now() - interval '30 days') as data_atualizacao
FROM notas_imagens ni
CROSS JOIN LATERAL jsonb_array_elements(ni.dados_extraidos->'itens') as item
WHERE ni.processada = true 
  AND ni.dados_extraidos::text ILIKE '%COSTAZUL%'
  AND item->>'descricao' IS NOT NULL
  AND COALESCE((item->>'valor_unitario')::numeric, (item->>'preco_unitario')::numeric, 0) > 0
ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = GREATEST(precos_atuais.data_atualizacao, EXCLUDED.data_atualizacao);