-- Função para corrigir preços manualmente de produtos específicos
CREATE OR REPLACE FUNCTION corrigir_precos_manuais()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Corrigir ALFACE AMERICANA
    UPDATE estoque_app 
    SET preco_unitario_ultimo = 3.99, updated_at = now()
    WHERE produto_nome LIKE '%ALFACE%' 
    AND produto_nome LIKE '%AMERICANA%'
    AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);
    
    -- Corrigir SACOLA PLÁSTICA
    UPDATE estoque_app 
    SET preco_unitario_ultimo = 0.09, updated_at = now()
    WHERE produto_nome LIKE '%SACOLA%' 
    AND produto_nome LIKE '%PLASTICA%'
    AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);
    
    -- Corrigir RÚCULA (caso necessário)
    UPDATE estoque_app 
    SET preco_unitario_ultimo = 3.19, updated_at = now()
    WHERE produto_nome LIKE '%RUCULA%'
    AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);
    
    RAISE NOTICE 'Preços corrigidos manualmente';
END;
$$;