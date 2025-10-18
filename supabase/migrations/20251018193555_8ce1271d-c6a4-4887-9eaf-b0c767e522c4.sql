-- Função para buscar produtos similares no catálogo master usando pg_trgm
CREATE OR REPLACE FUNCTION buscar_produtos_similares_master(
  p_nome_base TEXT,
  p_categoria TEXT,
  p_limite INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  nome_padrao TEXT,
  nome_base TEXT,
  marca TEXT,
  categoria TEXT,
  sku_global TEXT,
  qtd_valor NUMERIC,
  qtd_unidade TEXT,
  score REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pmg.id,
    pmg.nome_padrao,
    pmg.nome_base,
    pmg.marca,
    pmg.categoria,
    pmg.sku_global,
    pmg.qtd_valor,
    pmg.qtd_unidade,
    similarity(UPPER(pmg.nome_base), UPPER(p_nome_base)) as score
  FROM produtos_master_global pmg
  WHERE pmg.status = 'ativo'
  AND pmg.categoria = p_categoria
  AND similarity(UPPER(pmg.nome_base), UPPER(p_nome_base)) > 0.5
  ORDER BY score DESC
  LIMIT p_limite;
END;
$$;

-- Adicionar comentário para documentação
COMMENT ON FUNCTION buscar_produtos_similares_master IS 
'Busca produtos similares no catálogo master usando pg_trgm similarity. 
Usado para evitar duplicação durante normalização de novos produtos.';