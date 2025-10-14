-- Corrigir tipo de retorno da função verificar_disponibilidade_receita
DROP FUNCTION IF EXISTS verificar_disponibilidade_receita(uuid);

CREATE OR REPLACE FUNCTION verificar_disponibilidade_receita(receita_uuid uuid)
RETURNS TABLE(
  ingrediente_nome text,
  quantidade_necessaria text,
  disponivel boolean,
  quantidade_estoque numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ri.produto_nome_busca,
    ri.quantidade,
    CASE 
      WHEN e.id IS NOT NULL THEN true
      ELSE false
    END as disponivel,
    COALESCE(e.quantidade, 0) as quantidade_estoque
  FROM receita_ingredientes ri
  LEFT JOIN estoque_app e ON (
    e.user_id = auth.uid() AND
    (
      UPPER(TRIM(e.produto_nome)) = UPPER(TRIM(ri.produto_nome_busca)) OR
      UPPER(TRIM(e.produto_nome)) LIKE '%' || UPPER(TRIM(ri.produto_nome_busca)) || '%' OR
      UPPER(TRIM(ri.produto_nome_busca)) LIKE '%' || UPPER(TRIM(e.produto_nome)) || '%' OR
      similarity(UPPER(e.produto_nome), UPPER(ri.produto_nome_busca)) > 0.6
    )
  )
  WHERE ri.receita_id = receita_uuid
  ORDER BY ri.produto_nome_busca;
END;
$$;