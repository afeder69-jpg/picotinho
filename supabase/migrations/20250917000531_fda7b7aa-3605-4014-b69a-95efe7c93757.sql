-- Corrigir coordenadas para CEP 23050-101 (Lagoa, Rio de Janeiro)
-- Coordenadas corretas da Lagoa, RJ: -22.9727, -43.2055
UPDATE profiles 
SET 
  latitude = -22.9727,
  longitude = -43.2055,
  bairro = 'Lagoa',
  cidade = 'Rio de Janeiro',
  updated_at = now()
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697' 
AND cep = '23050-101';