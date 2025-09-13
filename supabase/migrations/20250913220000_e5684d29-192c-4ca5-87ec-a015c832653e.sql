-- Corrigir a data da nota do Torre & CIA para 12/09/2025
UPDATE notas_imagens 
SET dados_extraidos = jsonb_set(
  dados_extraidos, 
  '{compra,data_emissao}', 
  '"12/09/2025 20:00:00"'
)
WHERE id = '355f94c6-d97c-4e6f-bcc1-a1ed414e2208';

-- Garantir que futuras conversões de data mantenham o formato correto
-- Atualizando também possíveis outros campos de data que possam estar causando confusão
UPDATE notas_imagens 
SET dados_extraidos = jsonb_set(
  jsonb_set(dados_extraidos, '{dataCompra}', '"12/09/2025"'),
  '{data_emissao}', 
  '"12/09/2025"'
)
WHERE id = '355f94c6-d97c-4e6f-bcc1-a1ed414e2208';