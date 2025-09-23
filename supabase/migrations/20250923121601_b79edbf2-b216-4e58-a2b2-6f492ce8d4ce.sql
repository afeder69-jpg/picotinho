CREATE OR REPLACE FUNCTION public.buscar_categoria_por_termo(termo_busca text)
RETURNS TABLE(categoria_nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Buscar categoria por nome exato ou sinônimos
    RETURN QUERY
    SELECT c.nome as categoria_nome
    FROM categorias c
    WHERE c.ativa = true
    AND (
        UPPER(c.nome) = UPPER(termo_busca)
        OR UPPER(c.nome) LIKE '%' || UPPER(termo_busca) || '%'
        OR c.sinonimos @> ARRAY[LOWER(termo_busca)]
        OR EXISTS (
            SELECT 1 FROM unnest(c.sinonimos) as sinonimo
            WHERE UPPER(sinonimo) LIKE '%' || UPPER(termo_busca) || '%'
        )
    )
    ORDER BY 
        CASE 
            WHEN UPPER(c.nome) = UPPER(termo_busca) THEN 1
            WHEN c.sinonimos @> ARRAY[LOWER(termo_busca)] THEN 2
            ELSE 3
        END
    LIMIT 1;
END;
$$;