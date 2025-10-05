-- =====================================================
-- ETAPA 1: Criar Função RPC para Busca Fuzzy Otimizada
-- =====================================================

-- Função para busca fuzzy com pg_trgm por categoria
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
) AS $$
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
$$ LANGUAGE plpgsql STABLE;

-- Criar índice GIN para otimizar trigram em nome_base
CREATE INDEX IF NOT EXISTS idx_produtos_master_nome_base_trgm 
ON produtos_master_global 
USING gin (nome_base gin_trgm_ops);

-- Criar índice GIN para otimizar trigram em nome_padrao (útil para busca ampla)
CREATE INDEX IF NOT EXISTS idx_produtos_master_nome_padrao_trgm 
ON produtos_master_global 
USING gin (nome_padrao gin_trgm_ops);

-- =====================================================
-- Função RPC para criar sinônimo global automaticamente
-- =====================================================

CREATE OR REPLACE FUNCTION criar_sinonimo_global(
  produto_master_id_input UUID,
  texto_variacao_input TEXT,
  confianca_input NUMERIC DEFAULT 100
)
RETURNS UUID AS $$
DECLARE
  sinonimo_id UUID;
BEGIN
  -- Verificar se já existe
  SELECT id INTO sinonimo_id
  FROM produtos_sinonimos_globais
  WHERE produto_master_id = produto_master_id_input
    AND UPPER(TRIM(texto_variacao)) = UPPER(TRIM(texto_variacao_input));
  
  IF sinonimo_id IS NOT NULL THEN
    -- Já existe, apenas incrementar ocorrências
    UPDATE produtos_sinonimos_globais
    SET total_ocorrencias = total_ocorrencias + 1
    WHERE id = sinonimo_id;
    
    RETURN sinonimo_id;
  ELSE
    -- Criar novo sinônimo
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
$$ LANGUAGE plpgsql;

-- Comentários explicativos
COMMENT ON FUNCTION buscar_produtos_similares IS 'Busca fuzzy otimizada de produtos similares usando pg_trgm filtrada por categoria';
COMMENT ON FUNCTION criar_sinonimo_global IS 'Cria ou atualiza sinônimo global automaticamente, incrementando ocorrências se já existir';