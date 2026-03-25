
CREATE OR REPLACE FUNCTION public.resumo_estoque_por_categoria(p_user_id uuid)
RETURNS TABLE(
  categoria text,
  total_itens bigint,
  valor_pago numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH normalizado AS (
    SELECT
      UPPER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(e.produto_nome, '\s+', ' ', 'g'),
              '\mKG\M', '', 'gi'),
            '\mGRANEL\s+GRANEL\M', 'GRANEL', 'gi'),
          '\s+', ' ', 'g')
      )) AS nome_normalizado,
      e.quantidade,
      e.preco_unitario_ultimo,
      e.updated_at,
      CASE LOWER(TRIM(e.categoria))
        -- AÇOUGUE
        WHEN 'açougue' THEN 'açougue'
        WHEN 'acougue' THEN 'açougue'
        WHEN 'carnes' THEN 'açougue'
        WHEN 'carne' THEN 'açougue'
        WHEN 'frango' THEN 'açougue'
        WHEN 'frangos' THEN 'açougue'
        WHEN 'peixe' THEN 'açougue'
        WHEN 'peixes' THEN 'açougue'
        WHEN 'suínos' THEN 'açougue'
        WHEN 'suino' THEN 'açougue'
        WHEN 'bovino' THEN 'açougue'
        -- BEBIDAS
        WHEN 'bebidas' THEN 'bebidas'
        WHEN 'bebida' THEN 'bebidas'
        WHEN 'suco' THEN 'bebidas'
        WHEN 'sucos' THEN 'bebidas'
        WHEN 'refrigerante' THEN 'bebidas'
        WHEN 'refrigerantes' THEN 'bebidas'
        WHEN 'cerveja' THEN 'bebidas'
        WHEN 'cervejas' THEN 'bebidas'
        WHEN 'vinho' THEN 'bebidas'
        WHEN 'vinhos' THEN 'bebidas'
        WHEN 'água' THEN 'bebidas'
        WHEN 'agua' THEN 'bebidas'
        -- HORTIFRUTI
        WHEN 'hortifruti' THEN 'hortifruti'
        WHEN 'hortfruti' THEN 'hortifruti'
        WHEN 'hortifrute' THEN 'hortifruti'
        WHEN 'frutas' THEN 'hortifruti'
        WHEN 'verduras' THEN 'hortifruti'
        WHEN 'legumes' THEN 'hortifruti'
        WHEN 'hortaliças' THEN 'hortifruti'
        -- LATICÍNIOS/FRIOS
        WHEN 'laticínios/frios' THEN 'laticínios/frios'
        WHEN 'laticinios/frios' THEN 'laticínios/frios'
        WHEN 'laticinios' THEN 'laticínios/frios'
        WHEN 'laticínios' THEN 'laticínios/frios'
        WHEN 'frios' THEN 'laticínios/frios'
        WHEN 'queijo' THEN 'laticínios/frios'
        WHEN 'queijos' THEN 'laticínios/frios'
        WHEN 'leite' THEN 'laticínios/frios'
        WHEN 'iogurte' THEN 'laticínios/frios'
        WHEN 'manteiga' THEN 'laticínios/frios'
        WHEN 'requeijão' THEN 'laticínios/frios'
        WHEN 'embutidos' THEN 'laticínios/frios'
        -- HIGIENE/FARMÁCIA
        WHEN 'higiene/farmácia' THEN 'higiene/farmácia'
        WHEN 'higiene/farmacia' THEN 'higiene/farmácia'
        WHEN 'higiene' THEN 'higiene/farmácia'
        WHEN 'farmácia' THEN 'higiene/farmácia'
        WHEN 'farmacia' THEN 'higiene/farmácia'
        WHEN 'remedios' THEN 'higiene/farmácia'
        WHEN 'remédios' THEN 'higiene/farmácia'
        WHEN 'cuidados pessoais' THEN 'higiene/farmácia'
        WHEN 'sabonete' THEN 'higiene/farmácia'
        WHEN 'shampoo' THEN 'higiene/farmácia'
        WHEN 'creme dental' THEN 'higiene/farmácia'
        -- MERCEARIA
        WHEN 'mercearia' THEN 'mercearia'
        -- PADARIA
        WHEN 'padaria' THEN 'padaria'
        WHEN 'pão' THEN 'padaria'
        WHEN 'pao' THEN 'padaria'
        WHEN 'pães' THEN 'padaria'
        WHEN 'bolos' THEN 'padaria'
        WHEN 'biscoito' THEN 'padaria'
        WHEN 'biscoitos' THEN 'padaria'
        WHEN 'salgados' THEN 'padaria'
        WHEN 'torta' THEN 'padaria'
        -- CONGELADOS
        WHEN 'congelados' THEN 'congelados'
        WHEN 'congelado' THEN 'congelados'
        WHEN 'sorvete' THEN 'congelados'
        WHEN 'nuggets' THEN 'congelados'
        -- LIMPEZA
        WHEN 'limpeza' THEN 'limpeza'
        WHEN 'detergente' THEN 'limpeza'
        WHEN 'sabão' THEN 'limpeza'
        WHEN 'sabao' THEN 'limpeza'
        WHEN 'desinfetante' THEN 'limpeza'
        WHEN 'amaciante' THEN 'limpeza'
        WHEN 'água sanitária' THEN 'limpeza'
        WHEN 'cloro' THEN 'limpeza'
        -- PET
        WHEN 'pet' THEN 'pet'
        WHEN 'animais' THEN 'pet'
        WHEN 'ração' THEN 'pet'
        WHEN 'racao' THEN 'pet'
        -- OUTROS
        WHEN 'outros' THEN 'outros'
        WHEN 'diversos' THEN 'outros'
        WHEN 'variados' THEN 'outros'
        ELSE LOWER(TRIM(e.categoria))
      END AS categoria_normalizada
    FROM estoque_app e
    WHERE e.user_id = p_user_id
  ),
  consolidado AS (
    SELECT
      n.nome_normalizado,
      n.categoria_normalizada,
      SUM(n.quantidade) AS qtd_total,
      (ARRAY_AGG(n.preco_unitario_ultimo ORDER BY n.updated_at DESC))[1] AS preco_mais_recente
    FROM normalizado n
    GROUP BY n.nome_normalizado, n.categoria_normalizada
    HAVING SUM(n.quantidade) > 0
  )
  SELECT
    c.categoria_normalizada::text AS categoria,
    COUNT(*)::bigint AS total_itens,
    ROUND(SUM(ROUND(COALESCE(c.preco_mais_recente, 0) * c.qtd_total, 2)), 2)::numeric AS valor_pago
  FROM consolidado c
  GROUP BY c.categoria_normalizada
  ORDER BY valor_pago DESC;
END;
$$;
