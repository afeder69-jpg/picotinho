-- Corrigir o produto com hash "erro" para ABACATE
UPDATE estoque_app 
SET 
  produto_nome_normalizado = 'ABACATE GRANEL',
  produto_hash_normalizado = '006ad46d64c6e277062f96245aa7cc35c38b82ec116ee36786e821b73526470b'
WHERE produto_hash_normalizado = 'erro' 
AND produto_nome LIKE '%ABACATE%';

-- Atualizar a view para garantir que captura produtos com hash nulo/erro
DROP VIEW IF EXISTS public.estoque_consolidado;

CREATE VIEW public.estoque_consolidado AS
SELECT 
    COALESCE(
        NULLIF(produto_hash_normalizado, 'erro'),
        encode(sha256(UPPER(TRIM(produto_nome))::bytea), 'hex')
    ) as hash_agrupamento,
    
    COALESCE(
        NULLIF(produto_nome_normalizado, 'PRODUTO ERRO'),
        UPPER(TRIM(produto_nome))
    ) as produto_nome_exibicao,
    
    user_id,
    categoria,
    unidade_medida,
    SUM(quantidade) as quantidade_total,
    MAX(preco_unitario_ultimo) as preco_unitario_mais_recente,
    MAX(updated_at) as ultima_atualizacao,
    COUNT(*) as itens_originais,
    array_agg(id ORDER BY created_at) as ids_originais,
    array_agg(produto_nome ORDER BY created_at) as nomes_originais
FROM estoque_app
WHERE quantidade > 0
GROUP BY 
    COALESCE(
        NULLIF(produto_hash_normalizado, 'erro'),
        encode(sha256(UPPER(TRIM(produto_nome))::bytea), 'hex')
    ),
    user_id,
    categoria,
    unidade_medida,
    COALESCE(
        NULLIF(produto_nome_normalizado, 'PRODUTO ERRO'),
        UPPER(TRIM(produto_nome))
    );