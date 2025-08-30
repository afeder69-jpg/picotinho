-- Adicionar campos de geolocalização para supermercados
ALTER TABLE public.supermercados 
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- Criar índice para busca geográfica otimizada
CREATE INDEX IF NOT EXISTS idx_supermercados_location ON public.supermercados (latitude, longitude);

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.supermercados.latitude IS 'Latitude para cálculos de distância geográfica';
COMMENT ON COLUMN public.supermercados.longitude IS 'Longitude para cálculos de distância geográfica';