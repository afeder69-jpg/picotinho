-- Corrigir a RPC buscar_receitas_brasileiras_disponiveis
DROP FUNCTION IF EXISTS buscar_receitas_brasileiras_disponiveis();

CREATE OR REPLACE FUNCTION buscar_receitas_brasileiras_disponiveis()
RETURNS TABLE (
  receita_id uuid,
  titulo text,
  modo_preparo text,
  categoria text,
  imagem_url text,
  rendimento text,
  tags text[],
  total_ingredientes bigint,
  ingredientes_disponiveis bigint,
  disponibilidade text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH receita_stats AS (
    SELECT 
      rpb.id as receita_id,
      rpb.titulo,
      rpb.modo_preparo,
      rpb.categoria,
      rpb.imagem_url,
      rpb.rendimento,
      rpb.tags,
      CASE 
        WHEN rpb.ingredientes IS NULL OR jsonb_array_length(rpb.ingredientes) = 0 THEN 0
        ELSE jsonb_array_length(rpb.ingredientes)
      END::bigint as total_ingredientes,
      (
        SELECT COUNT(DISTINCT ing_text)::bigint
        FROM jsonb_array_elements_text(rpb.ingredientes) AS ing_text
        WHERE EXISTS (
          SELECT 1 FROM estoque_app e
          WHERE e.user_id = auth.uid() 
          AND (
            UPPER(TRIM(e.produto_nome)) LIKE '%' || UPPER(TRIM(ing_text)) || '%' OR
            UPPER(TRIM(ing_text)) LIKE '%' || UPPER(TRIM(e.produto_nome)) || '%' OR
            similarity(UPPER(e.produto_nome), UPPER(ing_text)) > 0.5
          )
        )
      ) as ingredientes_disponiveis
    FROM receitas_publicas_brasileiras rpb
  )
  SELECT 
    rs.receita_id,
    rs.titulo,
    rs.modo_preparo,
    rs.categoria,
    rs.imagem_url,
    rs.rendimento,
    rs.tags,
    rs.total_ingredientes,
    rs.ingredientes_disponiveis,
    CASE 
      WHEN rs.total_ingredientes = 0 THEN 'parcial'
      WHEN rs.ingredientes_disponiveis >= rs.total_ingredientes THEN 'completo'
      WHEN rs.ingredientes_disponiveis > 0 THEN 'parcial'
      ELSE 'indisponivel'
    END::text as disponibilidade
  FROM receita_stats rs
  ORDER BY rs.titulo;
END;
$$;