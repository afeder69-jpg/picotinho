
-- Backfill one-shot: sincroniza precos_atuais.data_atualizacao com a data real
-- da última nota processada que confirma o mesmo (cnpj + produto).
--
-- VERSÃO ROBUSTA: usa apenas ni.created_at (timestamptz garantido) como fonte
-- de data, evitando o parse de campos textuais em formato brasileiro
-- (DD/MM/YYYY HH24:MI:SS) que existem em dados_extraidos.
-- Conservador: NUNCA decrementa data, só adianta. Nunca toca em valor_unitario.

WITH datas_reais AS (
  SELECT
    REGEXP_REPLACE(COALESCE(
      ni.dados_extraidos->'estabelecimento'->>'cnpj',
      ni.dados_extraidos->'supermercado'->>'cnpj',
      ni.dados_extraidos->'emitente'->>'cnpj',
      ni.dados_extraidos->>'cnpj',
      ''
    ), '\D', '', 'g') AS cnpj,
    e.produto_master_id,
    e.produto_nome,
    MAX(ni.created_at) AS data_max
  FROM estoque_app e
  JOIN notas_imagens ni ON ni.id = e.nota_id
  WHERE ni.processada = true
    AND COALESCE(ni.excluida, false) = false
    AND e.nota_id IS NOT NULL
  GROUP BY 1, 2, 3
),
match_master AS (
  SELECT pa.id AS preco_id, MAX(d.data_max) AS data_real
  FROM precos_atuais pa
  JOIN datas_reais d
    ON d.cnpj = pa.estabelecimento_cnpj
   AND d.produto_master_id IS NOT NULL
   AND pa.produto_master_id IS NOT NULL
   AND d.produto_master_id = pa.produto_master_id
  GROUP BY pa.id
),
match_nome AS (
  SELECT pa.id AS preco_id, MAX(d.data_max) AS data_real
  FROM precos_atuais pa
  JOIN datas_reais d
    ON d.cnpj = pa.estabelecimento_cnpj
   AND UPPER(TRIM(d.produto_nome)) = UPPER(TRIM(pa.produto_nome))
  GROUP BY pa.id
),
candidatos AS (
  SELECT
    pa.id,
    GREATEST(
      COALESCE(mm.data_real, '-infinity'::timestamptz),
      COALESCE(mn.data_real, '-infinity'::timestamptz)
    ) AS data_real_max
  FROM precos_atuais pa
  LEFT JOIN match_master mm ON mm.preco_id = pa.id
  LEFT JOIN match_nome mn ON mn.preco_id = pa.id
  WHERE mm.preco_id IS NOT NULL OR mn.preco_id IS NOT NULL
)
UPDATE precos_atuais pa
SET data_atualizacao = c.data_real_max
FROM candidatos c
WHERE pa.id = c.id
  AND c.data_real_max > pa.data_atualizacao
  AND c.data_real_max <= now() + interval '1 day';
