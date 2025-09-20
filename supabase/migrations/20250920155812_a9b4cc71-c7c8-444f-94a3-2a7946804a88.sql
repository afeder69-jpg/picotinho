-- FUNÇÃO PARA ELIMINAR DUPLICAÇÕES DE PROCESSAMENTO E LIMPAR DADOS INCONSISTENTES

CREATE OR REPLACE FUNCTION public.limpar_duplicacoes_processamento()
RETURNS TABLE(acao_realizada text, quantidade integer, detalhes text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    usuario_id uuid;
    duplicatas_removidas integer := 0;
    notas_corrigidas integer := 0;
    produtos_corrigidos integer := 0;
BEGIN
    -- Obter o ID do usuário autenticado
    SELECT auth.uid() INTO usuario_id;
    
    IF usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;
    
    RAISE NOTICE '🧹 Iniciando limpeza de duplicações para usuário: %', usuario_id;
    
    -- 1. REMOVER PRODUTOS DUPLICADOS NO ESTOQUE (mesmo hash_normalizado)
    WITH duplicatas AS (
        SELECT 
            produto_hash_normalizado,
            user_id,
            COUNT(*) as total,
            MIN(created_at) as primeira_criacao,
            array_agg(id ORDER BY created_at) as ids
        FROM estoque_app 
        WHERE user_id = usuario_id
        AND produto_hash_normalizado IS NOT NULL
        GROUP BY produto_hash_normalizado, user_id
        HAVING COUNT(*) > 1
    ),
    consolidacao AS (
        SELECT 
            d.ids[1] as id_manter,
            d.ids[2:] as ids_remover,
            SUM(e.quantidade) as quantidade_total,
            MAX(e.preco_unitario_ultimo) as preco_mais_recente,
            MAX(e.updated_at) as ultima_atualizacao
        FROM duplicatas d
        JOIN estoque_app e ON e.produto_hash_normalizado = d.produto_hash_normalizado 
        WHERE e.user_id = usuario_id
        GROUP BY d.ids[1], d.ids[2:]
    )
    UPDATE estoque_app 
    SET 
        quantidade = c.quantidade_total,
        preco_unitario_ultimo = c.preco_mais_recente,
        updated_at = c.ultima_atualizacao
    FROM consolidacao c
    WHERE estoque_app.id = c.id_manter;
    
    -- Contar e remover duplicatas
    SELECT COUNT(*) INTO duplicatas_removidas
    FROM estoque_app e1
    WHERE e1.user_id = usuario_id
    AND EXISTS (
        SELECT 1 FROM estoque_app e2 
        WHERE e2.user_id = usuario_id
        AND e2.produto_hash_normalizado = e1.produto_hash_normalizado
        AND e2.created_at < e1.created_at
    );
    
    DELETE FROM estoque_app e1
    WHERE e1.user_id = usuario_id
    AND EXISTS (
        SELECT 1 FROM estoque_app e2 
        WHERE e2.user_id = usuario_id
        AND e2.produto_hash_normalizado = e1.produto_hash_normalizado
        AND e2.created_at < e1.created_at
    );
    
    RETURN QUERY SELECT 
        'DUPLICATAS_ESTOQUE_REMOVIDAS'::text,
        duplicatas_removidas,
        'Produtos duplicados com mesmo hash_normalizado foram consolidados'::text;
    
    -- 2. MARCAR NOTAS COMO NÃO PROCESSADAS SE FORAM PROCESSADAS MULTIPLAS VEZES
    UPDATE notas_imagens 
    SET processada = false, updated_at = now()
    WHERE usuario_id = usuario_id
    AND processada = true
    AND dados_extraidos IS NOT NULL;
    
    GET DIAGNOSTICS notas_corrigidas = ROW_COUNT;
    
    RETURN QUERY SELECT 
        'NOTAS_RESETADAS'::text,
        notas_corrigidas,
        'Notas marcadas como não processadas para reprocessamento exclusivo via IA-2'::text;
    
    -- 3. REMOVER PRODUTOS COM QUANTIDADE ZERO
    DELETE FROM estoque_app 
    WHERE user_id = usuario_id 
    AND quantidade <= 0;
    
    GET DIAGNOSTICS produtos_corrigidos = ROW_COUNT;
    
    RETURN QUERY SELECT 
        'PRODUTOS_ZERADOS_REMOVIDOS'::text,
        produtos_corrigidos,
        'Produtos com quantidade zero ou negativa foram removidos'::text;
    
    -- 4. LIMPAR PREÇOS ATUAIS DO USUÁRIO DUPLICADOS
    WITH precos_duplicados AS (
        SELECT 
            produto_nome,
            user_id,
            COUNT(*) as total,
            MIN(created_at) as primeira_criacao,
            array_agg(id ORDER BY data_atualizacao DESC) as ids
        FROM precos_atuais_usuario 
        WHERE user_id = usuario_id
        GROUP BY produto_nome, user_id
        HAVING COUNT(*) > 1
    )
    DELETE FROM precos_atuais_usuario 
    WHERE id IN (
        SELECT unnest(ids[2:]) FROM precos_duplicados
    );
    
    RAISE NOTICE '✅ Limpeza de duplicações concluída para usuário: %', usuario_id;
    
    RETURN;
END;
$function$;