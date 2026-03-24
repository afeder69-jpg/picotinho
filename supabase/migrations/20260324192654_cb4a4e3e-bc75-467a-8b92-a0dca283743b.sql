CREATE OR REPLACE FUNCTION public.buscar_produtos_master_por_palavras(
  p_palavras TEXT[],
  p_limite INT DEFAULT 20
)
RETURNS SETOF produtos_master_global AS $$
DECLARE
  v_query TEXT;
  v_palavra TEXT;
  v_search TEXT := 'unaccent(lower(COALESCE(nome_padrao,'''') || '' '' || COALESCE(nome_base,'''') || '' '' || COALESCE(marca,'''')))';
BEGIN
  v_query := 'SELECT * FROM produtos_master_global WHERE status = ''ativo''';
  
  FOREACH v_palavra IN ARRAY p_palavras LOOP
    v_query := v_query || ' AND ' || v_search || 
      ' LIKE ''%'' || unaccent(lower(' || quote_literal(v_palavra) || ')) || ''%''';
  END LOOP;
  
  v_query := v_query || ' ORDER BY total_notas DESC NULLS LAST LIMIT ' || p_limite;
  RETURN QUERY EXECUTE v_query;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;