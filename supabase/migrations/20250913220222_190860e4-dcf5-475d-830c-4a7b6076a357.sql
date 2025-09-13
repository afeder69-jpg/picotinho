-- Corrigir a data e hora da nota do Torre & CIA para 12/09/2025 às 10:15:51
UPDATE notas_imagens 
SET dados_extraidos = jsonb_set(
  dados_extraidos, 
  '{compra,data_emissao}', 
  '"12/09/2025 10:15:51"'
)
WHERE id = '355f94c6-d97c-4e6f-bcc1-a1ed414e2208';