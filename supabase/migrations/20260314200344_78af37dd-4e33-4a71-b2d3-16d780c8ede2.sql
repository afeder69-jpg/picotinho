-- Add ean_comercial column to estoque_app
ALTER TABLE public.estoque_app ADD COLUMN IF NOT EXISTS ean_comercial text;

-- Create partial index for fast EAN lookups (only non-null values)
CREATE INDEX IF NOT EXISTS idx_estoque_app_ean_comercial 
ON public.estoque_app (ean_comercial) 
WHERE ean_comercial IS NOT NULL;