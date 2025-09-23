-- Função para busca por similaridade de embedding
CREATE OR REPLACE FUNCTION vector_similarity_search(
    query_embedding TEXT,
    similarity_threshold FLOAT DEFAULT 0.3,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    sku TEXT,
    nome_normalizado TEXT,
    marca TEXT,
    categoria TEXT,
    variante TEXT,
    embedding vector(384),
    similarity FLOAT
)
LANGUAGE SQL
STABLE
AS $$
    SELECT 
        pn.id,
        pn.sku,
        pn.nome_normalizado,
        pn.marca,
        pn.categoria,
        pn.variante,
        pn.embedding,
        1 - (pn.embedding <=> query_embedding::vector) AS similarity
    FROM produtos_normalizados pn
    WHERE pn.embedding IS NOT NULL
    AND 1 - (pn.embedding <=> query_embedding::vector) > similarity_threshold
    ORDER BY pn.embedding <=> query_embedding::vector
    LIMIT match_count;
$$;

-- Função para calcular similaridade entre textos
CREATE OR REPLACE FUNCTION text_similarity(text1 TEXT, text2 TEXT)
RETURNS FLOAT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT similarity(text1, text2);
$$;

-- Função para buscar produto por SKU
CREATE OR REPLACE FUNCTION buscar_produto_por_sku(sku_busca TEXT)
RETURNS TABLE (
    id UUID,
    sku TEXT,
    nome_normalizado TEXT,
    marca TEXT,
    categoria TEXT,
    variante TEXT,
    descricao TEXT,
    provisorio BOOLEAN,
    ativo BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        id, sku, nome_normalizado, marca, categoria, variante, 
        descricao, provisorio, ativo, created_at, updated_at
    FROM produtos_normalizados
    WHERE produtos_normalizados.sku = sku_busca 
    AND ativo = true;
$$;

-- View materializada para estatísticas de normalização
CREATE MATERIALIZED VIEW IF NOT EXISTS stats_normalizacao AS
SELECT 
    DATE(created_at) as data,
    acao,
    COUNT(*) as total,
    AVG(score_agregado) as score_medio,
    MIN(score_agregado) as score_min,
    MAX(score_agregado) as score_max
FROM normalizacoes_log
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), acao
ORDER BY data DESC, acao;

-- Índice para a view materializada
CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_normalizacao_unique 
ON stats_normalizacao (data, acao);

-- Função para atualizar estatísticas
CREATE OR REPLACE FUNCTION refresh_stats_normalizacao()
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY stats_normalizacao;
$$;