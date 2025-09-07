-- CORREÇÃO DEFINITIVA: Inserir TODOS os produtos das notas da COSTAZUL que não estão em precos_atuais
WITH produtos_faltantes AS (
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
    AND ni.dados_extraidos IS NOT NULL
    AND (ni.dados_extraidos::text ILIKE '%COSTAZUL%' OR ni.dados_extraidos::text ILIKE '%17493338000397%')
    AND item->>'descricao' IS NOT NULL
    AND COALESCE((item->>'valor_unitario')::numeric, (item->>'preco_unitario')::numeric, 0) > 0
    AND LENGTH(TRIM(item->>'descricao')) > 2
)
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_nome, 
  estabelecimento_cnpj,
  data_atualizacao
)
SELECT 
  produto_nome_normalizado,
  valor_unitario,
  estabelecimento_nome,
  estabelecimento_cnpj,
  data_atualizacao
FROM produtos_faltantes pf
WHERE NOT EXISTS (
  SELECT 1 FROM precos_atuais pa 
  WHERE pa.produto_nome = pf.produto_nome_normalizado
  AND pa.estabelecimento_cnpj = pf.estabelecimento_cnpj
)
AND produto_nome_normalizado IS NOT NULL 
AND LENGTH(produto_nome_normalizado) > 2
ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = CASE 
    WHEN EXCLUDED.data_atualizacao > precos_atuais.data_atualizacao 
    THEN EXCLUDED.valor_unitario 
    ELSE precos_atuais.valor_unitario 
  END,
  data_atualizacao = GREATEST(precos_atuais.data_atualizacao, EXCLUDED.data_atualizacao);