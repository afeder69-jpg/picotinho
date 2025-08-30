-- Inserir supermercados de exemplo com dados respeitando os limites
INSERT INTO public.supermercados (nome, cnpj, endereco, cidade, estado, cep, latitude, longitude, ativo)
VALUES 
  ('Carrefour SP', '45543915000181', 'Av. das Nações Unidas, 22540', 'São Paulo', 'SP', '04795100', -23.5505, -46.6333, true),
  ('Extra Olimpia', '47508411000156', 'Av. Brigadeiro Faria Lima, 3732', 'São Paulo', 'SP', '04538132', -23.5893, -46.6875, true),
  ('Pão Açúcar', '33041260000156', 'Av. Ibirapuera, 3103', 'São Paulo', 'SP', '04029200', -23.5976, -46.6564, true)
ON CONFLICT (cnpj) DO UPDATE SET
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  updated_at = now();

-- Adicionar preços de exemplo
INSERT INTO public.precos_atuais (produto_nome, estabelecimento_cnpj, estabelecimento_nome, valor_unitario, data_atualizacao)
VALUES 
  ('BANANA PRATA KG', '45543915000181', 'Carrefour SP', 5.99, now()),
  ('LEITE LONGA VIDA 1L', '45543915000181', 'Carrefour SP', 4.89, now()),
  ('PAO DE FORMA', '45543915000181', 'Carrefour SP', 3.79, now()),
  ('BANANA PRATA KG', '47508411000156', 'Extra Olimpia', 6.49, now()),
  ('LEITE LONGA VIDA 1L', '47508411000156', 'Extra Olimpia', 4.99, now()),
  ('BANANA PRATA KG', '33041260000156', 'Pão Açúcar', 7.99, now()),
  ('LEITE LONGA VIDA 1L', '33041260000156', 'Pão Açúcar', 5.49, now())
ON CONFLICT (produto_nome, estabelecimento_cnpj) DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = now();