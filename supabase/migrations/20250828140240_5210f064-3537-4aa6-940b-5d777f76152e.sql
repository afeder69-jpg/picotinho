-- Remover as views existentes que têm SECURITY DEFINER
DROP VIEW IF EXISTS public.view_comparacao_supermercados_app;
DROP VIEW IF EXISTS public.view_gastos_categoria_app;
DROP VIEW IF EXISTS public.view_preco_medio_produto_app;

-- Recriar view_comparacao_supermercados_app sem SECURITY DEFINER
-- Esta view automaticamente respeitará as políticas RLS das tabelas subjacentes
CREATE VIEW public.view_comparacao_supermercados_app AS
SELECT 
    p.id AS produto_id,
    p.nome AS produto_nome,
    s.id AS supermercado_id,
    s.nome AS supermercado_nome,
    avg(ic.preco_unitario) AS preco_medio,
    count(ic.id) AS vezes_comprado,
    max(comp.data_compra) AS ultima_compra
FROM produtos_app p
JOIN itens_compra_app ic ON p.id = ic.produto_id
JOIN compras_app comp ON ic.compra_id = comp.id
JOIN supermercados s ON comp.supermercado_id = s.id
GROUP BY p.id, p.nome, s.id, s.nome;

-- Recriar view_gastos_categoria_app sem SECURITY DEFINER
-- Esta view automaticamente respeitará as políticas RLS das tabelas subjacentes
CREATE VIEW public.view_gastos_categoria_app AS
SELECT 
    cat.id AS categoria_id,
    cat.nome AS categoria_nome,
    sum(ic.preco_total) AS total_gasto,
    avg(ic.preco_total) AS gasto_medio,
    count(ic.id) AS total_itens
FROM categorias cat
JOIN produtos_app p ON cat.id = p.categoria_id
JOIN itens_compra_app ic ON p.id = ic.produto_id
JOIN compras_app comp ON ic.compra_id = comp.id
GROUP BY cat.id, cat.nome;

-- Recriar view_preco_medio_produto_app sem SECURITY DEFINER
-- Esta view automaticamente respeitará as políticas RLS das tabelas subjacentes
CREATE VIEW public.view_preco_medio_produto_app AS
SELECT 
    p.id AS produto_id,
    p.nome AS produto_nome,
    c.nome AS categoria_nome,
    avg(ic.preco_unitario) AS preco_medio,
    count(ic.id) AS total_compras,
    min(ic.preco_unitario) AS menor_preco,
    max(ic.preco_unitario) AS maior_preco
FROM produtos_app p
JOIN categorias c ON p.categoria_id = c.id
JOIN itens_compra_app ic ON p.id = ic.produto_id
GROUP BY p.id, p.nome, c.nome;