-- Adicionar coluna debug_texto para armazenar texto extraído do PDF
ALTER TABLE public.notas_imagens 
ADD COLUMN debug_texto TEXT;