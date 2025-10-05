-- Corrigir search_path nas funções recém-criadas

DROP FUNCTION IF EXISTS buscar_produtos_similares(TEXT, TEXT, INT, FLOAT);
DROP FUNCTION IF EXISTS criar_sinonimo_global(UUID, TEXT, NUMERIC);

-- Recriar com search_path seguro
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
    similarity(p.nome_base, texto_busca) as similarity
  FROM produtos_master_global p
  WHERE p.status = 'ativo'
    AND p.categoria = categoria_filtro
    AND similarity(p.nome_base, texto_busca) > threshold
  ORDER BY similarity DESC, p.total_usuarios DESC
  LIMIT limite;
END;
$$;

CREATE OR REPLACE FUNCTION criar_sinonimo_global(
  produto_master_id_input UUID,
  texto_variacao_input TEXT,
  confianca_input NUMERIC DEFAULT 100
)
RETURNS UUID 
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  sinonimo_id UUID;
BEGIN
  SELECT id INTO sinonimo_id
  FROM produtos_sinonimos_globais
  WHERE produto_master_id = produto_master_id_input
    AND UPPER(TRIM(texto_variacao)) = UPPER(TRIM(texto_variacao_input));
  
  IF sinonimo_id IS NOT NULL THEN
    UPDATE produtos_sinonimos_globais
    SET total_ocorrencias = total_ocorrencias + 1
    WHERE id = sinonimo_id;
    
    RETURN sinonimo_id;
  ELSE
    INSERT INTO produtos_sinonimos_globais (
      produto_master_id,
      texto_variacao,
      confianca,
      total_ocorrencias,
      fonte
    ) VALUES (
      produto_master_id_input,
      UPPER(TRIM(texto_variacao_input)),
      confianca_input,
      1,
      'auto_ia'
    )
    RETURNING id INTO sinonimo_id;
    
    RETURN sinonimo_id;
  END IF;
END;
$$;