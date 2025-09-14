-- Corrigir normalização de acentos nos nomes de produtos
-- Função para remover acentos e normalizar texto
CREATE OR REPLACE FUNCTION public.normalizar_texto(texto TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(
    TRANSLATE(
      texto,
      'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
      'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeeCcIIIIiiiiUUUUuuuuyNn'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;