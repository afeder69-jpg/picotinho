-- Função para limpar produtos fantasmas e corrigir preços zerados
CREATE OR REPLACE FUNCTION public.limpar_produtos_fantasmas_e_corrigir_precos()
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
    usuario_id uuid;
BEGIN
    -- Obter o ID do usuário autenticado
    SELECT auth.uid() INTO usuario_id;
    
    IF usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;
    
    -- 1. REMOVER PRODUTOS FANTASMAS (que não aparecem nas notas fiscais)
    FOR produto_record IN 
        SELECT e.id, e.produto_nome, e.quantidade
        FROM estoque_app e
        WHERE e.user_id = usuario_id
        AND NOT EXISTS (
            -- Verificar se produto aparece em alguma nota fiscal processada
            SELECT 1 FROM notas_imagens ni
            WHERE ni.usuario_id = usuario_id
            AND ni.processada = true
            AND ni.dados_extraidos IS NOT NULL
            AND (
                -- Buscar no array de itens das notas
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements(ni.dados_extraidos->'itens') as item
                    WHERE (
                        -- Normalizar e comparar nomes
                        UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(e.produto_nome))
                        OR UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(e.produto_nome)) || '%'
                        OR UPPER(TRIM(e.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
                        OR similarity(UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))), UPPER(TRIM(e.produto_nome))) > 0.7
                    )
                )
            )
        )
        AND e.origem = 'nota_fiscal' -- Só produtos que deveriam vir de notas
    LOOP
        -- Deletar produto fantasma
        DELETE FROM estoque_app 
        WHERE id = produto_record.id;
        
        RETURN QUERY SELECT 
            'PRODUTO_FANTASMA_REMOVIDO'::text,
            produto_record.produto_nome::text,
            ('Quantidade removida: ' || produto_record.quantidade::text)::text;
    END LOOP;
    
    -- 2. CORRIGIR PREÇOS ZERADOS
    FOR produto_record IN 
        SELECT e.id, e.produto_nome, e.quantidade, e.preco_unitario_ultimo
        FROM estoque_app e
        WHERE e.user_id = usuario_id
        AND (e.preco_unitario_ultimo IS NULL OR e.preco_unitario_ultimo = 0)
        AND e.quantidade > 0
    LOOP
        -- Buscar preço de referência nas notas fiscais
        SELECT INTO preco_referencia 
            (item->>'valor_unitario')::numeric as preco,
            (item->>'descricao')::text as produto_nota
        FROM notas_imagens ni
        CROSS JOIN jsonb_array_elements(ni.dados_extraidos->'itens') as item
        WHERE ni.usuario_id = usuario_id
        AND ni.processada = true
        AND ni.dados_extraidos IS NOT NULL
        AND (
            UPPER(TRIM(COALESCE(item->>'descricao', ''))) = UPPER(TRIM(produto_record.produto_nome))
            OR UPPER(TRIM(COALESCE(item->>'descricao', ''))) LIKE '%' || UPPER(TRIM(produto_record.produto_nome)) || '%'
            OR UPPER(TRIM(produto_record.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', ''))) || '%'
            OR similarity(UPPER(TRIM(COALESCE(item->>'descricao', ''))), UPPER(TRIM(produto_record.produto_nome))) > 0.7
        )
        AND (item->>'valor_unitario')::numeric > 0
        ORDER BY ni.created_at DESC
        LIMIT 1;
        
        IF FOUND THEN
            -- Atualizar com o preço encontrado
            UPDATE estoque_app 
            SET preco_unitario_ultimo = preco_referencia.preco,
                updated_at = now()
            WHERE id = produto_record.id;
            
            RETURN QUERY SELECT 
                'PRECO_CORRIGIDO'::text,
                produto_record.produto_nome::text,
                ('Preço aplicado: R$ ' || preco_referencia.preco::text || ' (baseado em: ' || preco_referencia.produto_nota || ')')::text;
        ELSE
            -- Buscar preço geral na tabela precos_atuais
            SELECT INTO preco_referencia 
                pa.valor_unitario as preco
            FROM precos_atuais pa
            WHERE (
                UPPER(pa.produto_nome) = UPPER(produto_record.produto_nome)
                OR UPPER(pa.produto_nome) LIKE '%' || UPPER(produto_record.produto_nome) || '%'
                OR UPPER(produto_record.produto_nome) LIKE '%' || UPPER(pa.produto_nome) || '%'
                OR similarity(UPPER(pa.produto_nome), UPPER(produto_record.produto_nome)) > 0.7
            )
            AND pa.valor_unitario > 0
            ORDER BY pa.data_atualizacao DESC
            LIMIT 1;
            
            IF FOUND THEN
                -- Atualizar com preço geral
                UPDATE estoque_app 
                SET preco_unitario_ultimo = preco_referencia.preco,
                    updated_at = now()
                WHERE id = produto_record.id;
                
                RETURN QUERY SELECT 
                    'PRECO_GERAL_APLICADO'::text,
                    produto_record.produto_nome::text,
                    ('Preço geral aplicado: R$ ' || preco_referencia.preco::text)::text;
            ELSE
                -- Produto sem referência de preço
                RETURN QUERY SELECT 
                    'SEM_PRECO_REFERENCIA'::text,
                    produto_record.produto_nome::text,
                    'Produto precisa de correção manual'::text;
            END IF;
        END IF;
    END LOOP;
    
    RETURN;
END;
$$;