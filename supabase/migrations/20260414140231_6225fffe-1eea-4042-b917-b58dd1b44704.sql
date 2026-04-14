
CREATE OR REPLACE FUNCTION public.comparar_masters_similares_batch(pares JSONB)
RETURNS TABLE(idx INT, score REAL)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  par JSONB;
  i INT := 0;
  m1_nome TEXT;
  m1_marca TEXT;
  m2_nome TEXT;
  m2_marca TEXT;
  score_nome NUMERIC;
  score_marca NUMERIC;
  score_final NUMERIC;
BEGIN
  IF pares IS NULL OR jsonb_typeof(pares) != 'array' THEN
    RETURN;
  END IF;

  FOR par IN SELECT * FROM jsonb_array_elements(pares)
  LOOP
    m1_nome := par->>'m1_nome';
    m1_marca := par->>'m1_marca';
    m2_nome := par->>'m2_nome';
    m2_marca := par->>'m2_marca';

    score_nome := similarity(
      normalizar_texto_similaridade(m1_nome),
      normalizar_texto_similaridade(m2_nome)
    );

    IF m1_marca IS NOT NULL AND m2_marca IS NOT NULL THEN
      score_marca := similarity(
        normalizar_texto_similaridade(m1_marca),
        normalizar_texto_similaridade(m2_marca)
      );
      score_final := (score_nome * 0.7) + (score_marca * 0.3);
    ELSE
      score_final := score_nome;
    END IF;

    idx := i;
    score := score_final::REAL;
    RETURN NEXT;
    i := i + 1;
  END LOOP;
END;
$$;
