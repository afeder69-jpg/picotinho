-- Adicionar coluna categoria na tabela consumos_app
ALTER TABLE public.consumos_app 
ADD COLUMN categoria character varying;

-- Atualizar registros existentes com categoria baseada no estoque atual
UPDATE public.consumos_app 
SET categoria = e.categoria
FROM public.estoque_app e
WHERE consumos_app.produto_id = e.id
AND consumos_app.categoria IS NULL;