-- Atualizar coordenadas dos supermercados para localizações corretas
UPDATE public.supermercados 
SET 
  latitude = -22.9035,
  longitude = -43.2096,
  endereco = 'Av. Nossa Senhora de Copacabana, 749, Copacabana',
  cidade = 'Rio de Janeiro',
  estado = 'RJ'
WHERE cnpj = '47508411000156'; -- Pão de Açúcar

-- Adicionar mais supermercados no Rio de Janeiro para teste
INSERT INTO public.supermercados (nome, cnpj, endereco, cidade, estado, cep, latitude, longitude, ativo)
VALUES 
  ('Extra Barra', '47508411000234', 'Av. das Américas, 3900, Barra da Tijuca', 'Rio de Janeiro', 'RJ', '22640100', -23.0045, -43.3198, true),
  ('Carrefour Tijuca', '45543915000234', 'Rua Conde de Bonfim, 520, Tijuca', 'Rio de Janeiro', 'RJ', '20520053', -22.9249, -43.2277, true),
  ('SuperMercado Zona Sul', '12345678000123', 'Rua Voluntários da Pátria, 448, Botafogo', 'Rio de Janeiro', 'RJ', '22270000', -22.9519, -43.1875, true)
ON CONFLICT (cnpj) DO UPDATE SET
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  endereco = EXCLUDED.endereco,
  cidade = EXCLUDED.cidade,
  estado = EXCLUDED.estado,
  cep = EXCLUDED.cep,
  updated_at = now();

-- Adicionar preços para os novos supermercados do Rio
INSERT INTO public.precos_atuais (produto_nome, estabelecimento_cnpj, estabelecimento_nome, valor_unitario, data_atualizacao)
VALUES 
  ('BANANA PRATA KG', '47508411000234', 'Extra Barra', 6.99, now()),
  ('LEITE LONGA VIDA 1L', '47508411000234', 'Extra Barra', 5.49, now()),
  ('PAO DE FORMA', '47508411000234', 'Extra Barra', 4.29, now()),
  ('BANANA PRATA KG', '45543915000234', 'Carrefour Tijuca', 5.79, now()),
  ('LEITE LONGA VIDA 1L', '45543915000234', 'Carrefour Tijuca', 4.99, now()),
  ('PAO DE FORMA', '45543915000234', 'Carrefour Tijuca', 3.89, now()),
  ('BANANA PRATA KG', '12345678000123', 'SuperMercado Zona Sul', 7.49, now()),
  ('LEITE LONGA VIDA 1L', '12345678000123', 'SuperMercado Zona Sul', 5.99, now())
ON CONFLICT (produto_nome, estabelecimento_cnpj) DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = now();