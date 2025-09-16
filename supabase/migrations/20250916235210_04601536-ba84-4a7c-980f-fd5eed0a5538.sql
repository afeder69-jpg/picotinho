-- Corrigir coordenadas do usuário para Recreio dos Bandeirantes (CEP 22790-705)
-- Coordenadas corretas: Recreio dos Bandeirantes, RJ
UPDATE profiles 
SET 
  latitude = -23.0274,
  longitude = -43.4817,
  bairro = 'Recreio dos Bandeirantes',
  cidade = 'Rio de Janeiro',
  updated_at = now()
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';