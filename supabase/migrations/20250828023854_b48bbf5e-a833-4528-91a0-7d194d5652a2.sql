-- Limpar todas as tabelas de teste relacionadas a notas
TRUNCATE TABLE public.notas_imagens RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.receipts RESTART IDENTITY CASCADE; 
TRUNCATE TABLE public.compras_app RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.itens_compra_app RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.estoque_app RESTART IDENTITY CASCADE;

-- Log da limpeza
SELECT 'Todas as tabelas de notas foram limpas com sucesso' as status;