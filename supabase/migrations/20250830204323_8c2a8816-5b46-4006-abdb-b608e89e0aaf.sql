-- Adicionar coordenadas para o mercado Superdelli (Recreio, Rio de Janeiro)
UPDATE public.supermercados 
SET 
  latitude = -23.0179, 
  longitude = -43.4526, 
  updated_at = now()
WHERE cnpj = '35881333000313';