-- Adicionar normalização para SUPERDELLI -> MEGABOX
INSERT INTO normalizacoes_estabelecimentos (nome_original, nome_normalizado, ativo)
VALUES ('SUPERDELLI ATACADO E SUPERMERCADOS SA', 'MEGABOX', true)
ON CONFLICT (nome_original) DO UPDATE SET 
  nome_normalizado = 'MEGABOX',
  ativo = true,
  updated_at = now();