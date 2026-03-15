
CREATE OR REPLACE FUNCTION public.listar_estabelecimentos_pendentes(
  p_incluir_normalizados boolean DEFAULT false,
  p_termo_busca text DEFAULT ''
)
RETURNS TABLE(
  nome_estabelecimento text,
  cnpj_estabelecimento text,
  total_notas bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH estabelecimentos_brutos AS (
    SELECT
      COALESCE(
        ni.dados_extraidos->'estabelecimento'->>'nome',
        ni.dados_extraidos->'supermercado'->>'nome',
        ni.dados_extraidos->'emitente'->>'nome'
      ) AS nome,
      COALESCE(
        ni.dados_extraidos->'estabelecimento'->>'cnpj',
        ni.dados_extraidos->'supermercado'->>'cnpj',
        ni.dados_extraidos->'emitente'->>'cnpj'
      ) AS cnpj
    FROM notas_imagens ni
    WHERE ni.processada = true
      AND ni.dados_extraidos IS NOT NULL
      AND ni.excluida IS NOT TRUE
  ),
  agrupados AS (
    SELECT
      UPPER(TRIM(eb.nome)) AS nome_limpo,
      NULLIF(TRIM(regexp_replace(eb.cnpj, '[^0-9]', '', 'g')), '') AS cnpj_limpo,
      COUNT(*) AS total
    FROM estabelecimentos_brutos eb
    WHERE eb.nome IS NOT NULL AND TRIM(eb.nome) <> ''
    GROUP BY UPPER(TRIM(eb.nome)), NULLIF(TRIM(regexp_replace(eb.cnpj, '[^0-9]', '', 'g')), '')
  )
  SELECT
    a.nome_limpo AS nome_estabelecimento,
    a.cnpj_limpo AS cnpj_estabelecimento,
    a.total AS total_notas
  FROM agrupados a
  WHERE
    -- Filtro de busca
    (
      p_termo_busca = '' 
      OR a.nome_limpo ILIKE '%' || p_termo_busca || '%'
      OR a.cnpj_limpo LIKE '%' || regexp_replace(p_termo_busca, '[^0-9]', '', 'g') || '%'
    )
    -- Filtro de normalizados
    AND (
      p_incluir_normalizados = true
      OR NOT EXISTS (
        SELECT 1 FROM normalizacoes_estabelecimentos ne
        WHERE ne.ativo = true
          AND (
            (a.cnpj_limpo IS NOT NULL AND ne.cnpj_original IS NOT NULL AND ne.cnpj_original = a.cnpj_limpo)
            OR (ne.nome_original = a.nome_limpo)
          )
      )
    )
  ORDER BY a.total DESC, a.nome_limpo;
END;
$$;
