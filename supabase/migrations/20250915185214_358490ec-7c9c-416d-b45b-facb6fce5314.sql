-- Criar uma view para consolidação segura do estoque (não destrutiva)
CREATE OR REPLACE VIEW public.estoque_consolidado AS
SELECT 
    user_id,
    COALESCE(produto_nome_normalizado, produto_nome) as produto_nome_exibicao,
    COALESCE(produto_hash_normalizado, encode(sha256(upper(trim(produto_nome))::bytea), 'hex')) as hash_agrupamento,
    categoria,
    unidade_medida,
    SUM(quantidade) as quantidade_total,
    MAX(preco_unitario_ultimo) as preco_unitario_mais_recente,
    MAX(updated_at) as ultima_atualizacao,
    COUNT(*) as itens_originais,
    array_agg(produto_nome ORDER BY created_at) as nomes_originais,
    array_agg(id ORDER BY created_at) as ids_originais
FROM estoque_app
WHERE quantidade > 0
GROUP BY 
    user_id, 
    COALESCE(produto_nome_normalizado, produto_nome),
    COALESCE(produto_hash_normalizado, encode(sha256(upper(trim(produto_nome))::bytea), 'hex')),
    categoria,
    unidade_medida;