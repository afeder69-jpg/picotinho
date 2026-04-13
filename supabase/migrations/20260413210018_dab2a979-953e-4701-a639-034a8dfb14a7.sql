-- Inativar o registro duplicado/genérico "SUPERDELLI" sem CNPJ
UPDATE public.normalizacoes_estabelecimentos
SET ativo = false, updated_at = now()
WHERE id = '334e4cde-4029-4e68-b951-7f72b2f57cd3'
  AND ativo = true
  AND cnpj_original IS NULL;