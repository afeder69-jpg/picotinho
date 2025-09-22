-- Fix Security Definer View issues by recreating views with SECURITY INVOKER

-- 1. Drop and recreate supermercados_publicos view with SECURITY INVOKER
DROP VIEW IF EXISTS public.supermercados_publicos;

CREATE VIEW public.supermercados_publicos
WITH (security_invoker = true)
AS
SELECT 
    id,
    nome,
    cidade,
    estado,
    round(latitude, 2) AS latitude_aproximada,
    round(longitude, 2) AS longitude_aproximada,
    ativo,
    created_at,
    updated_at
FROM supermercados
WHERE ativo = true;

-- 2. Drop and recreate view_comparacao_supermercados_app with SECURITY INVOKER
DROP VIEW IF EXISTS public.view_comparacao_supermercados_app;

CREATE VIEW public.view_comparacao_supermercados_app
WITH (security_invoker = true)
AS
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
JOIN compras_app comp ON ic.compra_id = comp.id AND comp.user_id = auth.uid()
JOIN supermercados s ON comp.supermercado_id = s.id
GROUP BY p.id, p.nome, s.id, s.nome;

-- 3. Recreate the materialized view estoque_consolidado (materialized views don't have security definer issues but let's ensure it's current)
DROP MATERIALIZED VIEW IF EXISTS public.estoque_consolidado;

CREATE MATERIALIZED VIEW public.estoque_consolidado AS
SELECT 
    COALESCE(NULLIF(produto_hash_normalizado, 'erro'), encode(sha256(upper(TRIM(produto_nome))::bytea), 'hex')) AS hash_agrupamento,
    COALESCE(NULLIF(produto_nome_normalizado, 'PRODUTO ERRO'), upper(TRIM(produto_nome))) AS produto_nome_exibicao,
    user_id,
    categoria,
    unidade_medida,
    sum(quantidade) AS quantidade_total,
    max(preco_unitario_ultimo) AS preco_unitario_mais_recente,
    max(updated_at) AS ultima_atualizacao,
    count(*) AS itens_originais,
    array_agg(id ORDER BY created_at) AS ids_originais,
    array_agg(produto_nome ORDER BY created_at) AS nomes_originais
FROM estoque_app
WHERE quantidade > 0
GROUP BY 
    COALESCE(NULLIF(produto_hash_normalizado, 'erro'), encode(sha256(upper(TRIM(produto_nome))::bytea), 'hex')),
    user_id,
    categoria,
    unidade_medida,
    COALESCE(NULLIF(produto_nome_normalizado, 'PRODUTO ERRO'), upper(TRIM(produto_nome)));

-- Create an index on the materialized view for performance
CREATE INDEX IF NOT EXISTS idx_estoque_consolidado_user_id_hash 
ON public.estoque_consolidado(user_id, hash_agrupamento);

-- Grant appropriate permissions
GRANT SELECT ON public.supermercados_publicos TO authenticated;
GRANT SELECT ON public.view_comparacao_supermercados_app TO authenticated;
GRANT SELECT ON public.estoque_consolidado TO authenticated;

-- Add comments for documentation
COMMENT ON VIEW public.supermercados_publicos IS 'Public view of active supermarkets with security invoker - uses querying user permissions';
COMMENT ON VIEW public.view_comparacao_supermercados_app IS 'User-specific supermarket comparison view with security invoker - respects user RLS';
COMMENT ON MATERIALIZED VIEW public.estoque_consolidado IS 'Consolidated stock view for better performance - refreshed periodically';