
-- Resetar notas órfãs: processada=true mas sem itens no estoque
UPDATE notas_imagens
SET processada = false, updated_at = now()
WHERE processada = true
  AND dados_extraidos IS NOT NULL
  AND (excluida IS NULL OR excluida = false)
  AND NOT (dados_extraidos ? 'erro')
  AND id NOT IN (
    SELECT DISTINCT nota_id FROM estoque_app WHERE nota_id IS NOT NULL
  );
