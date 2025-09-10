-- Função específica para limpar produtos do usuário atual (via edge function)
CREATE OR REPLACE FUNCTION public.limpar_produtos_fantasmas_usuario(target_user_id uuid)
RETURNS TABLE(
    acao_realizada text,
    produto_afetado text,
    detalhes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    produto_record RECORD;
    preco_referencia RECORD;
BEGIN
    -- 1. REMOVER PRODUTOS FANTASMAS
    FOR produto_record IN 
        SELECT e.id, e.produto_nome, e.quantidade
        FROM estoque_app e
        WHERE e.user_id = target_user_id
        AND e.produto_nome IN ('SACOLA PLASTICA 1UN', 'ALFACE AMERICANA 1UN')
    LOOP
        DELETE FROM estoque_app WHERE id = produto_record.id;
        
        RETURN QUERY SELECT 
            'PRODUTO_FANTASMA_REMOVIDO'::text,
            produto_record.produto_nome::text,
            ('Quantidade removida: ' || produto_record.quantidade::text)::text;
    END LOOP;
    
    -- 2. CORRIGIR PREÇOS ZERADOS PARA RÚCULA
    UPDATE estoque_app 
    SET preco_unitario_ultimo = 3.19, 
        updated_at = now()
    WHERE user_id = target_user_id 
    AND produto_nome = 'RÚCULA 1UN'
    AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);
    
    IF FOUND THEN
        RETURN QUERY SELECT 
            'PRECO_CORRIGIDO'::text,
            'RÚCULA 1UN'::text,
            'Preço aplicado: R$ 3.19 (da nota fiscal)'::text;
    END IF;
    
    -- 3. CORRIGIR PREÇOS ZERADOS PARA SACOLA PLAST50X60 10KG
    UPDATE estoque_app 
    SET preco_unitario_ultimo = 0.15, 
        updated_at = now()
    WHERE user_id = target_user_id 
    AND produto_nome = 'SACOLA PLAST50X60 10KG'
    AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);
    
    IF FOUND THEN
        RETURN QUERY SELECT 
            'PRECO_CORRIGIDO'::text,
            'SACOLA PLAST50X60 10KG'::text,
            'Preço aplicado: R$ 0.15 (da nota fiscal)'::text;
    END IF;
    
    RETURN;
END;
$$;