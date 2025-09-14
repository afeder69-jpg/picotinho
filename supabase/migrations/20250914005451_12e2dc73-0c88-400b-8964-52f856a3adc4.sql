-- Criar função de normalização avançada
CREATE OR REPLACE FUNCTION normalizar_produto_completo(nome TEXT) 
RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(
    TRIM(
      REGEXP_REPLACE(
        TRANSLATE(
          nome,
          'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
          'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeeCcIIIIiiiiUUUUuuuuyNn'
        ),
        '\s+', ' ', 'g'
      )
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;