
ALTER TABLE public.listas_compras_itens
DROP CONSTRAINT IF EXISTS listas_compras_itens_produto_id_fkey;

ALTER TABLE public.listas_compras_itens
ADD CONSTRAINT listas_compras_itens_produto_id_fkey
FOREIGN KEY (produto_id) REFERENCES public.produtos_master_global(id)
ON DELETE SET NULL;
