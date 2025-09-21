-- Add compra_id column to estoque_app table
ALTER TABLE public.estoque_app 
ADD COLUMN IF NOT EXISTS compra_id uuid;

-- Add foreign key constraint referencing compras_app.id
ALTER TABLE public.estoque_app 
ADD CONSTRAINT fk_estoque_app_compra_id 
FOREIGN KEY (compra_id) REFERENCES public.compras_app(id) ON DELETE SET NULL;

-- Create index for optimization
CREATE INDEX IF NOT EXISTS idx_estoque_app_compra_id 
ON public.estoque_app (compra_id);