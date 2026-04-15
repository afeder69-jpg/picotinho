ALTER TABLE public.listas_compras DROP CONSTRAINT listas_compras_origem_check;

ALTER TABLE public.listas_compras ADD CONSTRAINT listas_compras_origem_check CHECK (origem IN ('manual', 'receita', 'cardapio', 'whatsapp', 'estoque'));