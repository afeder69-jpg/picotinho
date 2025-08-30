-- Inserir alguns supermercados de exemplo com coordenadas para testar a funcionalidade de área de atuação
-- Supermercados em São Paulo
INSERT INTO public.supermercados (nome, cnpj, endereco, cidade, estado, cep, latitude, longitude, ativo)
VALUES 
  ('Carrefour São Paulo', '45.543.915/0001-81', 'Av. das Nações Unidas, 22540', 'São Paulo', 'SP', '04795-100', -23.5505, -46.6333, true),
  ('Extra Vila Olímpia', '47.508.411/0001-56', 'Av. Brigadeiro Faria Lima, 3732', 'São Paulo', 'SP', '04538-132', -23.5893, -46.6875, true),
  ('Pão de Açúcar Ibirapuera', '33.041.260/0001-56', 'Av. Ibirapuera, 3103', 'São Paulo', 'SP', '04029-200', -23.5976, -46.6564, true)
ON CONFLICT (cnpj) DO UPDATE SET
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  updated_at = now();

-- Adicionar alguns preços de exemplo para estes supermercados
INSERT INTO public.precos_atuais (produto_nome, estabelecimento_cnpj, estabelecimento_nome, valor_unitario, data_atualizacao)
VALUES 
  ('BANANA PRATA KG', '45.543.915/0001-81', 'Carrefour São Paulo', 5.99, now()),
  ('LEITE LONGA VIDA 1L', '45.543.915/0001-81', 'Carrefour São Paulo', 4.89, now()),
  ('PAO DE FORMA', '45.543.915/0001-81', 'Carrefour São Paulo', 3.79, now()),
  ('BANANA PRATA KG', '47.508.411/0001-56', 'Extra Vila Olímpia', 6.49, now()),
  ('LEITE LONGA VIDA 1L', '47.508.411/0001-56', 'Extra Vila Olímpia', 4.99, now()),
  ('BANANA PRATA KG', '33.041.260/0001-56', 'Pão de Açúcar Ibirapuera', 7.99, now()),
  ('LEITE LONGA VIDA 1L', '33.041.260/0001-56', 'Pão de Açúcar Ibirapuera', 5.49, now())
ON CONFLICT (produto_nome, estabelecimento_cnpj) DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = now();