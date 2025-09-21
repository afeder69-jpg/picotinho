-- Adicionar coluna data_compra na tabela itens_nota
ALTER TABLE public.itens_nota 
ADD COLUMN data_compra DATE;