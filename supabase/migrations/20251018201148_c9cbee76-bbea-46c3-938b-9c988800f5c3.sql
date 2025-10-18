-- Função auxiliar para normalizar texto removendo acentos
CREATE OR REPLACE FUNCTION normalizar_texto_similaridade(texto TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN UPPER(
    TRANSLATE(
      texto,
      'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
      'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeeCcIIIIiiiiUUUUuuuuyNn'
    )
  );
END;
$$;

-- Função para comparar masters usando similaridade trigram
CREATE OR REPLACE FUNCTION comparar_masters_similares(
  m1_nome TEXT,
  m1_marca TEXT,
  m2_nome TEXT,
  m2_marca TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  score_nome NUMERIC;
  score_marca NUMERIC;
  score_final NUMERIC;
BEGIN
  -- Comparar nomes normalizados usando pg_trgm
  score_nome := similarity(
    normalizar_texto_similaridade(m1_nome),
    normalizar_texto_similaridade(m2_nome)
  );
  
  -- Se ambas as marcas existem, comparar e ponderar
  IF m1_marca IS NOT NULL AND m2_marca IS NOT NULL THEN
    score_marca := similarity(
      normalizar_texto_similaridade(m1_marca),
      normalizar_texto_similaridade(m2_marca)
    );
    -- Peso: 70% nome + 30% marca
    score_final := (score_nome * 0.7) + (score_marca * 0.3);
  ELSE
    -- Se não tem marca para comparar, usar apenas nome
    score_final := score_nome;
  END IF;
  
  RETURN score_final;
END;
$$;