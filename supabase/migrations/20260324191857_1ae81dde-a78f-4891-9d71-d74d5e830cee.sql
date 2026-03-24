CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.buscar_produtos_master_por_palavras(p_palavras TEXT[])
RETURNS TABLE (
  id UUID,
  nome_padrao TEXT,
  nome_base TEXT,
  marca TEXT,
  categoria TEXT,
  codigo_barras TEXT,
  imagem_url TEXT,
  sku_global TEXT,
  qtd_valor NUMERIC,
  qtd_unidade TEXT,
  unidade_base TEXT
) AS $$
DECLARE
  v_query TEXT;
  v_palavra TEXT;
  v_search_field TEXT := 'unaccent(lower(COALESCE(nome_padrao,'''') || '' '' || COALESCE(nome_base,'''') || '' '' || COALESCE(marca,'''')))';
BEGIN
  v_query := 'SELECT id, nome_padrao, nome_base, marca, categoria, codigo_barras, imagem_url, sku_global, qtd_valor, qtd_unidade, unidade_base FROM produtos_master_global WHERE status = ''ativo''';

  FOREACH v_palavra IN ARRAY p_palavras LOOP
    v_query := v_query || ' AND ' || v_search_field || ' LIKE ''%'' || unaccent(lower(' || quote_literal(v_palavra) || ')) || ''%''';
  END LOOP;

  v_query := v_query || ' ORDER BY total_notas DESC NULLS LAST LIMIT 20';
  RETURN QUERY EXECUTE v_query;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;