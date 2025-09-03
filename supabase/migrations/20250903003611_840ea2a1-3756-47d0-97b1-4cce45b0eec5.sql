-- CORREÇÃO DE SEGURANÇA: Remover views inseguras que não respeitam RLS
-- Problema: As views profiles_safe e users_safe ainda existem e podem expor dados

-- 1. Remover views inseguras que expõem dados pessoais
DROP VIEW IF EXISTS profiles_safe CASCADE;
DROP VIEW IF EXISTS users_safe CASCADE;

-- 2. Corrigir views de relatórios para respeitar RLS do usuário atual
-- Estas views devem mostrar apenas dados do usuário autenticado

-- Recriar view_comparacao_supermercados_app com segurança
DROP VIEW IF EXISTS view_comparacao_supermercados_app CASCADE;
CREATE VIEW view_comparacao_supermercados_app AS 
SELECT 
    p.id AS produto_id,
    p.nome AS produto_nome,
    s.id AS supermercado_id,
    s.nome AS supermercado_nome,
    avg(ic.preco_unitario) AS preco_medio,
    count(ic.id) AS vezes_comprado,
    max(comp.data_compra) AS ultima_compra
FROM produtos_app p
JOIN itens_compra_app ic ON (p.id = ic.produto_id)
JOIN compras_app comp ON (ic.compra_id = comp.id AND comp.user_id = auth.uid())
JOIN supermercados s ON (comp.supermercado_id = s.id)
GROUP BY p.id, p.nome, s.id, s.nome;

-- Recriar view_gastos_categoria_app com segurança  
DROP VIEW IF EXISTS view_gastos_categoria_app CASCADE;
CREATE VIEW view_gastos_categoria_app AS
SELECT 
    cat.id AS categoria_id,
    cat.nome AS categoria_nome,
    sum(ic.preco_total) AS total_gasto,
    avg(ic.preco_total) AS gasto_medio,
    count(ic.id) AS total_itens
FROM categorias cat
JOIN produtos_app p ON (cat.id = p.categoria_id)
JOIN itens_compra_app ic ON (p.id = ic.produto_id)
JOIN compras_app comp ON (ic.compra_id = comp.id AND comp.user_id = auth.uid())
WHERE cat.user_id = auth.uid()
GROUP BY cat.id, cat.nome;

-- Recriar view_preco_medio_produto_app com segurança
DROP VIEW IF EXISTS view_preco_medio_produto_app CASCADE;
CREATE VIEW view_preco_medio_produto_app AS
SELECT 
    p.id AS produto_id,
    p.nome AS produto_nome,
    c.nome AS categoria_nome,
    avg(ic.preco_unitario) AS preco_medio,
    count(ic.id) AS total_compras,
    min(ic.preco_unitario) AS menor_preco,
    max(ic.preco_unitario) AS maior_preco
FROM produtos_app p
JOIN categorias c ON (p.categoria_id = c.id AND c.user_id = auth.uid())
JOIN itens_compra_app ic ON (p.id = ic.produto_id)
JOIN compras_app comp ON (ic.compra_id = comp.id AND comp.user_id = auth.uid())
GROUP BY p.id, p.nome, c.nome;

-- 3. Habilitar RLS nas views (mesmo que seja redundante, é boa prática)
ALTER VIEW view_comparacao_supermercados_app SET (security_invoker = on);
ALTER VIEW view_gastos_categoria_app SET (security_invoker = on);  
ALTER VIEW view_preco_medio_produto_app SET (security_invoker = on);

-- 4. Remover funções que podem expor dados desnecessariamente
DROP FUNCTION IF EXISTS get_public_profile_info(uuid);
DROP FUNCTION IF EXISTS get_user_safe_info(uuid);

-- 5. Comentários de documentação de segurança
COMMENT ON VIEW view_comparacao_supermercados_app IS 'View segura - mostra apenas dados do usuário autenticado';
COMMENT ON VIEW view_gastos_categoria_app IS 'View segura - mostra apenas dados do usuário autenticado';
COMMENT ON VIEW view_preco_medio_produto_app IS 'View segura - mostra apenas dados do usuário autenticado';