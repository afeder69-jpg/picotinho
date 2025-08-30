-- Cadastrar mercado Superdelli que tem nota fiscal mas não estava na tabela supermercados
INSERT INTO public.supermercados (
  nome,
  cnpj,
  endereco,
  cidade,
  estado,
  ativo,
  created_at,
  updated_at
) VALUES (
  'SUPERDELLI ATACADO E SUPERMERCADOS SA',
  '35881333000313',
  'AVENIDA DAS AMERICAS, 13700, RECREIO',
  'Rio de Janeiro',
  'RJ',
  true,
  now(),
  now()
) ON CONFLICT (cnpj) DO UPDATE SET
  nome = EXCLUDED.nome,
  endereco = EXCLUDED.endereco,
  cidade = EXCLUDED.cidade,
  estado = EXCLUDED.estado,
  ativo = EXCLUDED.ativo,
  updated_at = now();