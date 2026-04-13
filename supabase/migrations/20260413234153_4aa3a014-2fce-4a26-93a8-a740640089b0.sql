
-- Itens embalados (granel IS NOT TRUE): normalizar PESO/VOLUME/UNIDADE → UN
UPDATE listas_compras_itens i
SET unidade_medida = 'UN'
FROM produtos_master_global p
WHERE i.produto_id = p.id
  AND p.granel IS NOT TRUE
  AND UPPER(TRIM(i.unidade_medida)) IN ('PESO', 'VOLUME', 'UNIDADE');

-- Itens granel: normalizar unidade_base com mapeamento completo
UPDATE listas_compras_itens i
SET unidade_medida = CASE
    WHEN UPPER(TRIM(TRANSLATE(p.unidade_base, '.', ''))) IN ('QUILO', 'QUILOS', 'QUILOGRAMA', 'QUILOGRAMAS', 'KGS', 'KG') THEN 'KG'
    WHEN UPPER(TRIM(TRANSLATE(p.unidade_base, '.', ''))) IN ('GRAMA', 'GRAMAS', 'GR', 'GRS', 'G') THEN 'G'
    WHEN UPPER(TRIM(TRANSLATE(p.unidade_base, '.', ''))) IN ('LITRO', 'LITROS', 'LTS', 'LT', 'L') THEN 'L'
    WHEN UPPER(TRIM(TRANSLATE(p.unidade_base, '.', ''))) IN ('MILILITRO', 'MILILITROS', 'MLS', 'ML') THEN 'ML'
    WHEN UPPER(TRIM(TRANSLATE(p.unidade_base, '.', ''))) IN ('UNIDADE', 'UNIDADES', 'UND', 'UNID', 'UN') THEN 'UN'
    WHEN p.unidade_base IS NULL OR TRIM(p.unidade_base) = '' THEN
      CASE p.categoria_unidade
        WHEN 'PESO' THEN 'KG'
        WHEN 'VOLUME' THEN 'L'
        ELSE 'UN'
      END
    ELSE UPPER(TRIM(p.unidade_base))
  END
FROM produtos_master_global p
WHERE i.produto_id = p.id
  AND p.granel = true
  AND UPPER(TRIM(i.unidade_medida)) IN ('PESO', 'VOLUME', 'UNIDADE');
