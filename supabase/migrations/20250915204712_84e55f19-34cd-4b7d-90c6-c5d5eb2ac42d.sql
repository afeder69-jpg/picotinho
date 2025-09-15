-- CORREÇÃO COMPLETA: Remover SECURITY DEFINER desnecessários

-- 1. Funções que podem usar RLS ao invés de SECURITY DEFINER
-- Corrigir função de correção de preços manuais
CREATE OR REPLACE FUNCTION public.corrigir_precos_manuais()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Verificar se usuário tem permissão (RLS fará o controle)
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
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

-- 2. Corrigir função de produtos manuais sem preço
CREATE OR REPLACE FUNCTION public.corrigir_produtos_manuais_sem_preco()
RETURNS TABLE(produto_id uuid, produto_nome text, quantidade numeric, preco_sugerido numeric, acao_realizada text)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    produto_record RECORD;
    preco_referencia RECORD;
    novo_preco NUMERIC;
BEGIN
    -- Verificar autenticação (RLS controlará acesso)
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    -- Buscar produtos inseridos manualmente sem preço definido
    FOR produto_record IN 
        SELECT 
            e.id,
            e.produto_nome,
            e.quantidade,
            e.preco_unitario_ultimo,
            e.user_id
        FROM estoque_app e
        WHERE (e.preco_unitario_ultimo IS NULL OR e.preco_unitario_ultimo = 0)
        AND NOT EXISTS (
            SELECT 1 FROM notas_imagens ni 
            WHERE ni.dados_extraidos::text LIKE '%' || e.produto_nome || '%'
            AND ni.processada = true
            AND ni.usuario_id = e.user_id
        )
    LOOP
        -- Resto da lógica mantida igual...
        SELECT INTO preco_referencia
            valor_unitario
        FROM precos_atuais pa
        WHERE UPPER(pa.produto_nome) = produto_record.produto_nome
           OR UPPER(pa.produto_nome) LIKE '%' || produto_record.produto_nome || '%'
           OR produto_record.produto_nome LIKE '%' || UPPER(pa.produto_nome) || '%'
        ORDER BY pa.data_atualizacao DESC
        LIMIT 1;
        
        IF FOUND THEN
            novo_preco := preco_referencia.valor_unitario;
            
            UPDATE estoque_app 
            SET preco_unitario_ultimo = novo_preco,
                updated_at = now()
            WHERE id = produto_record.id;
            
            RETURN QUERY SELECT 
                produto_record.id,
                produto_record.produto_nome::text,
                produto_record.quantidade,
                novo_preco,
                'Preço corrigido com valor de referência'::text;
        ELSE
            RETURN QUERY SELECT 
                produto_record.id,
                produto_record.produto_nome::text,
                produto_record.quantidade,
                0.0::numeric,
                'Requer correção manual - sem preço de referência'::text;
        END IF;
    END LOOP;
    
    RETURN;
END;
$$;