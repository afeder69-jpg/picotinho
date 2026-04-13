-- Correção: inativar registro SUPERDELLI com ID correto
UPDATE public.normalizacoes_estabelecimentos
SET ativo = false, updated_at = now()
WHERE id = '334e4cde-ab2d-4c3a-a9dc-4356cfd38fe3'
  AND ativo = true
  AND cnpj_original IS NULL;