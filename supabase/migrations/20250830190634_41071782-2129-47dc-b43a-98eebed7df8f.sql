-- Adicionar coordenadas para COSTAZUL ALIMENTOS LTDA (do recibo processado)
UPDATE public.supermercados 
SET 
  latitude = -22.8897,  -- Campo Grande, RJ (próximo à localização do usuário)
  longitude = -43.5450,
  endereco = 'AVENIDA CESARIO DE MELO, 5400, CAMPO GRANDE',
  cidade = 'Rio de Janeiro',
  estado = 'RJ',
  cep = '23045000',
  cnpj = '17493338000397',  -- CNPJ correto do recibo
  updated_at = now()
WHERE nome = 'COSTAZUL ALIMENTOS LTDA';

-- Se não existir, inserir
INSERT INTO public.supermercados (nome, cnpj, endereco, cidade, estado, cep, latitude, longitude, ativo)
VALUES ('COSTAZUL ALIMENTOS LTDA', '17493338000397', 'AVENIDA CESARIO DE MELO, 5400, CAMPO GRANDE', 'Rio de Janeiro', 'RJ', '23045000', -22.8897, -43.5450, true)
ON CONFLICT (cnpj) DO UPDATE SET
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  endereco = EXCLUDED.endereco,
  cidade = EXCLUDED.cidade,
  estado = EXCLUDED.estado,
  cep = EXCLUDED.cep,
  updated_at = now();

-- Adicionar alguns preços para este supermercado
INSERT INTO public.precos_atuais (produto_nome, estabelecimento_cnpj, estabelecimento_nome, valor_unitario, data_atualizacao)
VALUES 
  ('QUEIJO MUCARELA', '17493338000397', 'COSTAZUL ALIMENTOS LTDA', 86.99, now()),
  ('BEBIDA LACTEA', '17493338000397', 'COSTAZUL ALIMENTOS LTDA', 3.69, now()),
  ('ACHOCOLATADO EM PO', '17493338000397', 'COSTAZUL ALIMENTOS LTDA', 10.98, now()),
  ('EXTRATO DE TOMATE', '17493338000397', 'COSTAZUL ALIMENTOS LTDA', 11.99, now()),
  ('PAO DE FORMA', '17493338000397', 'COSTAZUL ALIMENTOS LTDA', 8.98, now()),
  ('MAMAO FORMOSA KG', '17493338000397', 'COSTAZUL ALIMENTOS LTDA', 9.99, now()),
  ('MANGA PALMER KG', '17493338000397', 'COSTAZUL ALIMENTOS LTDA', 6.99, now())
ON CONFLICT (produto_nome, estabelecimento_cnpj) DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = now();