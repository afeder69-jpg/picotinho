-- FIX: Business Location Data Security Issue
-- Remove overly permissive public access and implement secure data exposure

-- 1. Remove the overly permissive public policy
DROP POLICY IF EXISTS "Supermercados básicos são públicos" ON public.supermercados;

-- 2. Update the existing public view to only expose safe, non-sensitive data
DROP VIEW IF EXISTS public.supermercados_publicos;

-- 3. Create a secure public view with only basic, non-sensitive information
CREATE VIEW public.supermercados_publicos AS
SELECT 
    id,
    nome,
    cidade,
    estado,
    -- Only approximate location (rounded to ~1km precision for privacy)
    ROUND(latitude::numeric, 2) as latitude_aproximada,
    ROUND(longitude::numeric, 2) as longitude_aproximada,
    ativo,
    created_at,
    updated_at
FROM supermercados 
WHERE ativo = true;

-- 4. Grant public access to the secure view only
GRANT SELECT ON public.supermercados_publicos TO public;
GRANT SELECT ON public.supermercados_publicos TO anon;

-- 5. Update the existing authenticated user policy to be more specific
-- Users can only see full details of stores they have receipts from
DROP POLICY IF EXISTS "Usuários podem ver dados básicos de supermercados com notas" ON public.supermercados;

CREATE POLICY "Usuários podem ver supermercados onde compraram" 
ON public.supermercados 
FOR SELECT 
TO authenticated
USING (
    ativo = true 
    AND EXISTS (
        SELECT 1 FROM notas_imagens ni
        WHERE ni.usuario_id = auth.uid()
        AND ni.processada = true
        AND ni.dados_extraidos IS NOT NULL
        AND (
            regexp_replace(COALESCE(ni.dados_extraidos->>'cnpj', ''), '[^\d]', '', 'g') = 
            regexp_replace(COALESCE(supermercados.cnpj::text, ''), '[^\d]', '', 'g')
            OR
            regexp_replace(COALESCE(ni.dados_extraidos->'estabelecimento'->>'cnpj', ''), '[^\d]', '', 'g') = 
            regexp_replace(COALESCE(supermercados.cnpj::text, ''), '[^\d]', '', 'g')
            OR
            regexp_replace(COALESCE(ni.dados_extraidos->'supermercado'->>'cnpj', ''), '[^\d]', '', 'g') = 
            regexp_replace(COALESCE(supermercados.cnpj::text, ''), '[^\d]', '', 'g')
            OR
            regexp_replace(COALESCE(ni.dados_extraidos->'emitente'->>'cnpj', ''), '[^\d]', '', 'g') = 
            regexp_replace(COALESCE(supermercados.cnpj::text, ''), '[^\d]', '', 'g')
        )
    )
);

-- 6. Create a secure function for area-based searches that respects privacy
CREATE OR REPLACE FUNCTION public.get_supermercados_for_area(
    search_latitude numeric,
    search_longitude numeric,
    search_radius_km numeric,
    requesting_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    nome text,
    cidade text,
    estado text,
    latitude_publica numeric,
    longitude_publica numeric,
    distancia_km numeric,
    produtos_disponiveis bigint,
    tem_acesso_completo boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.nome::text,
        s.cidade::text,
        s.estado::text,
        -- Only return approximate coordinates for privacy
        CASE 
            WHEN requesting_user_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM notas_imagens ni
                WHERE ni.usuario_id = requesting_user_id
                AND ni.processada = true
                AND ni.dados_extraidos IS NOT NULL
                AND regexp_replace(COALESCE(ni.dados_extraidos->>'cnpj', ''), '[^\d]', '', 'g') = 
                    regexp_replace(COALESCE(s.cnpj::text, ''), '[^\d]', '', 'g')
            )
            THEN s.latitude  -- Full precision for stores user has receipts from
            ELSE ROUND(s.latitude::numeric, 2)  -- Approximate for others
        END as latitude_publica,
        CASE 
            WHEN requesting_user_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM notas_imagens ni
                WHERE ni.usuario_id = requesting_user_id
                AND ni.processada = true
                AND ni.dados_extraidos IS NOT NULL
                AND regexp_replace(COALESCE(ni.dados_extraidos->>'cnpj', ''), '[^\d]', '', 'g') = 
                    regexp_replace(COALESCE(s.cnpj::text, ''), '[^\d]', '', 'g')
            )
            THEN s.longitude  -- Full precision for stores user has receipts from
            ELSE ROUND(s.longitude::numeric, 2)  -- Approximate for others
        END as longitude_publica,
        -- Calculate distance using Haversine formula
        (6371 * acos(
            cos(radians(search_latitude)) * 
            cos(radians(s.latitude)) * 
            cos(radians(s.longitude) - radians(search_longitude)) + 
            sin(radians(search_latitude)) * 
            sin(radians(s.latitude))
        ))::numeric as distancia_km,
        -- Count available products (approximation)
        COALESCE((
            SELECT COUNT(DISTINCT item->>'descricao')
            FROM notas_imagens ni
            CROSS JOIN jsonb_array_elements(ni.dados_extraidos->'itens') as item
            WHERE ni.processada = true
            AND ni.dados_extraidos IS NOT NULL
            AND regexp_replace(COALESCE(ni.dados_extraidos->>'cnpj', ''), '[^\d]', '', 'g') = 
                regexp_replace(COALESCE(s.cnpj::text, ''), '[^\d]', '', 'g')
        ), 0) as produtos_disponiveis,
        -- Indicate if user has full access to this store's data
        CASE 
            WHEN requesting_user_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM notas_imagens ni
                WHERE ni.usuario_id = requesting_user_id
                AND ni.processada = true
                AND ni.dados_extraidos IS NOT NULL
                AND regexp_replace(COALESCE(ni.dados_extraidos->>'cnpj', ''), '[^\d]', '', 'g') = 
                    regexp_replace(COALESCE(s.cnpj::text, ''), '[^\d]', '', 'g')
            )
            THEN true
            ELSE false
        END as tem_acesso_completo
    FROM supermercados s
    WHERE s.ativo = true
    AND s.latitude IS NOT NULL 
    AND s.longitude IS NOT NULL
    AND (6371 * acos(
        cos(radians(search_latitude)) * 
        cos(radians(s.latitude)) * 
        cos(radians(s.longitude) - radians(search_longitude)) + 
        sin(radians(search_latitude)) * 
        sin(radians(s.latitude))
    )) <= search_radius_km
    ORDER BY distancia_km;
END;
$$;