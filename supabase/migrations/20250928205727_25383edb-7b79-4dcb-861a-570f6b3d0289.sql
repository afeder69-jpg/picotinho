-- Correção do timing do trigger de sincronização de chave_acesso
-- Criar trigger adicional para compras_app quando inserido

-- Função para sincronizar chave_acesso quando compras_app é inserido
CREATE OR REPLACE FUNCTION sync_access_key_to_compras_app()
RETURNS TRIGGER AS $$
DECLARE
    chave_extraida TEXT;
BEGIN
    -- Buscar chave_acesso em notas_imagens do mesmo usuário
    SELECT 
        COALESCE(
            dados_extraidos->'compra'->>'chave_acesso',
            dados_extraidos->>'chave_acesso',
            dados_extraidos->'nota_fiscal'->>'chave_acesso'
        ) INTO chave_extraida
    FROM notas_imagens
    WHERE usuario_id = NEW.user_id
    AND processada = true
    AND dados_extraidos IS NOT NULL
    AND created_at >= (NEW.created_at - INTERVAL '3 hours')
    AND created_at <= (NEW.created_at + INTERVAL '1 hour')
    AND (
        COALESCE(
            dados_extraidos->'compra'->>'chave_acesso',
            dados_extraidos->>'chave_acesso',
            dados_extraidos->'nota_fiscal'->>'chave_acesso'
        ) IS NOT NULL
        AND LENGTH(TRIM(COALESCE(
            dados_extraidos->'compra'->>'chave_acesso',
            dados_extraidos->>'chave_acesso',
            dados_extraidos->'nota_fiscal'->>'chave_acesso'
        ))) = 44
    )
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Se encontrou chave válida e o registro não tem chave ainda
    IF chave_extraida IS NOT NULL AND (NEW.chave_acesso IS NULL OR NEW.chave_acesso = '' OR LENGTH(TRIM(NEW.chave_acesso)) < 44) THEN
        NEW.chave_acesso := TRIM(chave_extraida);
        
        RAISE NOTICE 'Chave de acesso % sincronizada para compras_app % do usuário %', 
            chave_extraida, NEW.id, NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para executar ANTES do INSERT em compras_app
CREATE TRIGGER sync_access_key_on_compras_insert
    BEFORE INSERT ON compras_app
    FOR EACH ROW
    EXECUTE FUNCTION sync_access_key_to_compras_app();

-- Backfill: Atualizar registros existentes em compras_app que não têm chave_acesso
UPDATE compras_app 
SET chave_acesso = subquery.chave_extraida,
    updated_at = now()
FROM (
    SELECT DISTINCT ON (ca.id)
        ca.id as compra_id,
        TRIM(COALESCE(
            ni.dados_extraidos->'compra'->>'chave_acesso',
            ni.dados_extraidos->>'chave_acesso',
            ni.dados_extraidos->'nota_fiscal'->>'chave_acesso'
        )) as chave_extraida
    FROM compras_app ca
    JOIN notas_imagens ni ON ni.usuario_id = ca.user_id
    WHERE (ca.chave_acesso IS NULL OR ca.chave_acesso = '' OR LENGTH(TRIM(ca.chave_acesso)) < 44)
    AND ni.processada = true
    AND ni.dados_extraidos IS NOT NULL
    AND ni.created_at >= (ca.created_at - INTERVAL '3 hours')
    AND ni.created_at <= (ca.created_at + INTERVAL '1 hour')
    AND COALESCE(
        ni.dados_extraidos->'compra'->>'chave_acesso',
        ni.dados_extraidos->>'chave_acesso',
        ni.dados_extraidos->'nota_fiscal'->>'chave_acesso'
    ) IS NOT NULL
    AND LENGTH(TRIM(COALESCE(
        ni.dados_extraidos->'compra'->>'chave_acesso',
        ni.dados_extraidos->>'chave_acesso',
        ni.dados_extraidos->'nota_fiscal'->>'chave_acesso'
    ))) = 44
    ORDER BY ca.id, ni.created_at DESC
) as subquery
WHERE compras_app.id = subquery.compra_id;