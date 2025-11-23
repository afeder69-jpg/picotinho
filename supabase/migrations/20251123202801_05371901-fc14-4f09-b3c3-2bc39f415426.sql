-- Corrigir RPC buscar_produtos_similares para usar nome_padrao e categoria case-insensitive
CREATE OR REPLACE FUNCTION buscar_produtos_similares(
  texto_busca TEXT,
  categoria_filtro TEXT,
  limite INT DEFAULT 10,
  threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  sku_global TEXT,
  nome_padrao TEXT,
  nome_base TEXT,
  marca TEXT,
  categoria TEXT,
  tipo_embalagem TEXT,
  qtd_valor NUMERIC,
  qtd_unidade TEXT,
  granel BOOLEAN,
  total_usuarios INT,
  similarity FLOAT
) 
LANGUAGE plpgsql 
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.sku_global,
    p.nome_padrao,
    p.nome_base,
    p.marca,
    p.categoria,
    p.tipo_embalagem,
    p.qtd_valor,
    p.qtd_unidade,
    p.granel,
    p.total_usuarios,
    -- Usar nome_padrao em vez de nome_base para comparação mais precisa
    similarity(p.nome_padrao, texto_busca) as similarity
  FROM produtos_master_global p
  WHERE p.status = 'ativo'
    -- Categoria case-insensitive para maior flexibilidade
    AND UPPER(p.categoria) = UPPER(categoria_filtro)
    -- Usar nome_padrao em vez de nome_base
    AND similarity(p.nome_padrao, texto_busca) > threshold
  ORDER BY similarity DESC, p.total_usuarios DESC
  LIMIT limite;
END;
$$;

COMMENT ON FUNCTION buscar_produtos_similares IS 
'Busca produtos similares usando pg_trgm no nome_padrao completo (não apenas nome_base). 
Categoria é case-insensitive para maior flexibilidade.';