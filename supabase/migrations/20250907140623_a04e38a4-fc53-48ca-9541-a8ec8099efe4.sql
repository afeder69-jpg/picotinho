-- Inserir TODOS os produtos da nota da COSTAZUL na tabela precos_atuais
-- Usar CTE para evitar duplicatas e aplicar normalização correta
WITH produtos_costazul AS (
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
    '2025-08-25 15:13:00'::timestamp with time zone as data_compra
  FROM notas_imagens ni
  CROSS JOIN LATERAL jsonb_array_elements(ni.dados_extraidos->'itens') as item
  WHERE ni.processada = true 
    AND ni.dados_extraidos::text ILIKE '%COSTAZUL%'
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
  'COSTAZUL ALIMENTOS LTDA',
  '17493338000397',
  data_compra
FROM produtos_costazul
WHERE produto_nome_normalizado IS NOT NULL 
  AND LENGTH(produto_nome_normalizado) > 2
ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = GREATEST(precos_atuais.data_atualizacao, EXCLUDED.data_atualizacao);