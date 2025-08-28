-- Remover as views existentes que têm SECURITY DEFINER
DROP VIEW IF EXISTS public.view_comparacao_supermercados_app;
DROP VIEW IF EXISTS public.view_gastos_categoria_app;
DROP VIEW IF EXISTS public.view_preco_medio_produto_app;

-- Recriar view_comparacao_supermercados_app sem SECURITY DEFINER
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

-- Habilitar RLS nas views
ALTER VIEW public.view_comparacao_supermercados_app ENABLE ROW LEVEL SECURITY;
ALTER VIEW public.view_gastos_categoria_app ENABLE ROW LEVEL SECURITY;
ALTER VIEW public.view_preco_medio_produto_app ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS para view_comparacao_supermercados_app
CREATE POLICY "Usuários podem ver comparações de seus dados"
ON public.view_comparacao_supermercados_app
FOR SELECT
USING (
    EXISTS (
        SELECT 1 
        FROM compras_app comp
        JOIN itens_compra_app ic ON comp.id = ic.compra_id
        JOIN produtos_app p ON ic.produto_id = p.id
        WHERE p.id = view_comparacao_supermercados_app.produto_id
        AND comp.user_id = auth.uid()
    )
);

-- Criar políticas RLS para view_gastos_categoria_app
CREATE POLICY "Usuários podem ver gastos de suas categorias"
ON public.view_gastos_categoria_app
FOR SELECT
USING (
    EXISTS (
        SELECT 1 
        FROM categorias cat
        WHERE cat.id = view_gastos_categoria_app.categoria_id
        AND cat.user_id = auth.uid()
    )
);

-- Criar políticas RLS para view_preco_medio_produto_app
CREATE POLICY "Usuários podem ver preços médios de seus produtos"
ON public.view_preco_medio_produto_app
FOR SELECT
USING (
    EXISTS (
        SELECT 1 
        FROM compras_app comp
        JOIN itens_compra_app ic ON comp.id = ic.compra_id
        WHERE ic.produto_id = view_preco_medio_produto_app.produto_id
        AND comp.user_id = auth.uid()
    )
);