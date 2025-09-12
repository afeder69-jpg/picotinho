-- Backfill direto das coordenadas usando SQL
UPDATE supermercados 
SET 
  latitude = -22.913414,
  longitude = -43.563045,
  updated_at = now()
WHERE cnpj = '07760885001814'
AND (latitude IS NULL OR longitude IS NULL);

UPDATE supermercados 
SET 
  latitude = -22.892987,
  longitude = -43.559063,
  updated_at = now()
WHERE cnpj = '45543915025176'
AND (latitude IS NULL OR longitude IS NULL);