CREATE OR REPLACE FUNCTION public.buscar_categoria_por_termo(termo_busca text)
RETURNS TABLE(categoria_nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Normalizar o termo de busca (minúsculo, sem acentos)
    termo_busca := LOWER(TRIM(termo_busca));
    
    -- Buscar categoria por nome exato, nome parcial ou sinônimos
    RETURN QUERY
    SELECT c.nome as categoria_nome
    FROM categorias c
    WHERE c.ativa = true
    AND (
        -- Busca exata no nome (case-insensitive)
        LOWER(c.nome) = termo_busca
        
        -- Busca parcial no nome (case-insensitive)
        OR LOWER(c.nome) LIKE '%' || termo_busca || '%'
        
        -- Busca exata nos sinônimos (case-insensitive)
        OR EXISTS (
            SELECT 1 FROM unnest(c.sinonimos) as sinonimo
            WHERE LOWER(sinonimo) = termo_busca
        )
        
        -- Busca parcial nos sinônimos (case-insensitive)
        OR EXISTS (
            SELECT 1 FROM unnest(c.sinonimos) as sinonimo
            WHERE LOWER(sinonimo) LIKE '%' || termo_busca || '%'
        )
        
        -- Busca se o termo está contido em algum sinônimo
        OR EXISTS (
            SELECT 1 FROM unnest(c.sinonimos) as sinonimo
            WHERE termo_busca LIKE '%' || LOWER(sinonimo) || '%'
        )
    )
    ORDER BY 
        CASE 
            -- Prioridade 1: Nome exato
            WHEN LOWER(c.nome) = termo_busca THEN 1
            -- Prioridade 2: Sinônimo exato
            WHEN EXISTS (
                SELECT 1 FROM unnest(c.sinonimos) as sinonimo
                WHERE LOWER(sinonimo) = termo_busca
            ) THEN 2
            -- Prioridade 3: Nome contém o termo
            WHEN LOWER(c.nome) LIKE '%' || termo_busca || '%' THEN 3
            -- Prioridade 4: Sinônimo contém o termo
            ELSE 4
        END,
        -- Ordenar por tamanho (mais específico primeiro)
        LENGTH(c.nome)
    LIMIT 1;
END;
$$;