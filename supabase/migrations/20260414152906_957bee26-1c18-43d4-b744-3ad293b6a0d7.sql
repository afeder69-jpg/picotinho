
-- Ensure unaccent extension is available
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Helper function: normalize text robustly (upper, trim, unaccent, remove punctuation, collapse spaces)
CREATE OR REPLACE FUNCTION public.normalizar_texto_robusto(texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      upper(trim(unaccent(coalesce(texto, '')))),
      '[.,\-/\(\)\[\]''"!?;:#+*]', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  );
$$;

-- Main RPC: find matches for pending candidates against master catalog
CREATE OR REPLACE FUNCTION public.buscar_matches_pendentes_masters(
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  candidato_id uuid,
  texto_original text,
  master_id uuid,
  master_nome_padrao text,
  master_categoria text,
  master_marca text,
  master_qtd_valor numeric,
  master_qtd_unidade text,
  camada text,
  score real,
  candidato_marca text,
  candidato_qtd_valor numeric,
  candidato_qtd_unidade text,
  candidato_categoria text,
  candidato_nome_padrao_sugerido text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  match_found boolean;
  norm_texto text;
  norm_sugerido text;
  master_count integer;
  matched_master_id uuid;
  matched_master_nome text;
  matched_master_cat text;
  matched_master_marca text;
  matched_master_qtd_val numeric;
  matched_master_qtd_un text;
  sim_rec RECORD;
BEGIN
  -- Process each pending candidate
  FOR rec IN
    SELECT c.id, c.texto_original, c.marca_sugerida, c.qtd_valor_sugerido, 
           c.qtd_unidade_sugerido, c.categoria_sugerida, c.nome_padrao_sugerido
    FROM produtos_candidatos_normalizacao c
    WHERE c.status = 'pendente'
    ORDER BY c.created_at DESC
    LIMIT p_limit
  LOOP
    match_found := false;
    
    -- ========== CAMADA 1: Sinônimo conhecido ==========
    SELECT s.produto_master_id, m.nome_padrao, m.categoria, m.marca, m.qtd_valor, m.qtd_unidade
    INTO matched_master_id, matched_master_nome, matched_master_cat, matched_master_marca, matched_master_qtd_val, matched_master_qtd_un
    FROM produtos_sinonimos_globais s
    JOIN produtos_master_global m ON m.id = s.produto_master_id AND m.status = 'ativo'
    WHERE upper(trim(s.texto_variacao)) = upper(trim(rec.texto_original))
      AND s.aprovado_em IS NOT NULL
    LIMIT 1;
    
    IF matched_master_id IS NOT NULL THEN
      candidato_id := rec.id;
      texto_original := rec.texto_original;
      master_id := matched_master_id;
      master_nome_padrao := matched_master_nome;
      master_categoria := matched_master_cat;
      master_marca := matched_master_marca;
      master_qtd_valor := matched_master_qtd_val;
      master_qtd_unidade := matched_master_qtd_un;
      camada := 'sinonimo';
      score := 1.0;
      candidato_marca := rec.marca_sugerida;
      candidato_qtd_valor := rec.qtd_valor_sugerido;
      candidato_qtd_unidade := rec.qtd_unidade_sugerido;
      candidato_categoria := rec.categoria_sugerida;
      candidato_nome_padrao_sugerido := rec.nome_padrao_sugerido;
      RETURN NEXT;
      CONTINUE;
    END IF;
    
    -- ========== CAMADA 2: Nome normalizado idêntico ==========
    norm_texto := normalizar_texto_robusto(rec.texto_original);
    norm_sugerido := CASE WHEN rec.nome_padrao_sugerido IS NOT NULL AND rec.nome_padrao_sugerido != '' 
                         THEN normalizar_texto_robusto(rec.nome_padrao_sugerido) 
                         ELSE NULL END;
    
    -- Count how many active masters match the normalized text
    SELECT count(*) INTO master_count
    FROM produtos_master_global m
    WHERE m.status = 'ativo'
      AND (normalizar_texto_robusto(m.nome_padrao) = norm_texto
           OR (norm_sugerido IS NOT NULL AND normalizar_texto_robusto(m.nome_padrao) = norm_sugerido));
    
    -- Only proceed if exactly 1 master matches (uniqueness lock)
    IF master_count = 1 THEN
      SELECT m.id, m.nome_padrao, m.categoria, m.marca, m.qtd_valor, m.qtd_unidade
      INTO matched_master_id, matched_master_nome, matched_master_cat, matched_master_marca, matched_master_qtd_val, matched_master_qtd_un
      FROM produtos_master_global m
      WHERE m.status = 'ativo'
        AND (normalizar_texto_robusto(m.nome_padrao) = norm_texto
             OR (norm_sugerido IS NOT NULL AND normalizar_texto_robusto(m.nome_padrao) = norm_sugerido))
      LIMIT 1;
      
      candidato_id := rec.id;
      texto_original := rec.texto_original;
      master_id := matched_master_id;
      master_nome_padrao := matched_master_nome;
      master_categoria := matched_master_cat;
      master_marca := matched_master_marca;
      master_qtd_valor := matched_master_qtd_val;
      master_qtd_unidade := matched_master_qtd_un;
      camada := 'nome_normalizado';
      score := 1.0;
      candidato_marca := rec.marca_sugerida;
      candidato_qtd_valor := rec.qtd_valor_sugerido;
      candidato_qtd_unidade := rec.qtd_unidade_sugerido;
      candidato_categoria := rec.categoria_sugerida;
      candidato_nome_padrao_sugerido := rec.nome_padrao_sugerido;
      RETURN NEXT;
      CONTINUE;
    END IF;
    
    -- ========== CAMADA 3: Similaridade textual ==========
    FOR sim_rec IN
      SELECT m.id, m.nome_padrao, m.categoria, m.marca, m.qtd_valor, m.qtd_unidade,
             similarity(normalizar_texto_robusto(m.nome_padrao), norm_texto)::real AS sim_score
      FROM produtos_master_global m
      WHERE m.status = 'ativo'
        AND similarity(normalizar_texto_robusto(m.nome_padrao), norm_texto) >= 0.3
      ORDER BY sim_score DESC
      LIMIT 1
    LOOP
      candidato_id := rec.id;
      texto_original := rec.texto_original;
      master_id := sim_rec.id;
      master_nome_padrao := sim_rec.nome_padrao;
      master_categoria := sim_rec.categoria;
      master_marca := sim_rec.marca;
      master_qtd_valor := sim_rec.qtd_valor;
      master_qtd_unidade := sim_rec.qtd_unidade;
      camada := 'similaridade';
      score := sim_rec.sim_score;
      candidato_marca := rec.marca_sugerida;
      candidato_qtd_valor := rec.qtd_valor_sugerido;
      candidato_qtd_unidade := rec.qtd_unidade_sugerido;
      candidato_categoria := rec.categoria_sugerida;
      candidato_nome_padrao_sugerido := rec.nome_padrao_sugerido;
      RETURN NEXT;
    END LOOP;
    
  END LOOP;
END;
$$;
