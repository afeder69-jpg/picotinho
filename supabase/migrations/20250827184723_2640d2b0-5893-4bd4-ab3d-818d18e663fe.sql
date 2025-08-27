-- Função para consolidar produtos duplicados no estoque
CREATE OR REPLACE FUNCTION consolidar_estoque_duplicado()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    produto_record RECORD;
    nome_normalizado TEXT;
    quantidade_total NUMERIC;
    ultimo_preco NUMERIC;
    ultimo_update TIMESTAMP;
    primeiro_id UUID;
BEGIN
    -- Função para normalizar nomes (mesma lógica da edge function)
    CREATE OR REPLACE FUNCTION normalizar_nome_produto(nome TEXT)
    RETURNS TEXT
    LANGUAGE plpgsql
    IMMUTABLE
    AS $func$
    BEGIN
        RETURN TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(
                                        REGEXP_REPLACE(
                                            REGEXP_REPLACE(
                                                REGEXP_REPLACE(
                                                    REGEXP_REPLACE(
                                                        REGEXP_REPLACE(
                                                            UPPER(nome),
                                                            '\s+', ' ', 'g'
                                                        ),
                                                        '\bGRAENC\b', 'GRANEL', 'g'
                                                    ),
                                                    '\bGRANEL\s*KG\b', 'KG GRANEL', 'g'
                                                ),
                                                '\bKG\s*GRANEL\b', 'GRANEL KG', 'g'
                                            ),
                                            '\bREQUEIJAO\s*$', 'REQUEIJAO', 'g'
                                        ),
                                        '\bFATIADO\b', '', 'g'
                                    ),
                                    '\bMINI\s*LANCHE\b', '', 'g'
                                ),
                                '\b170G\s*AMEIXA\b', '', 'g'
                            ),
                            '\b380G\b', '', 'g'
                        ),
                        '\b450G\s*100\s*NUTRICAO\b', '', 'g'
                    ),
                    '\b480G\b', '', 'g'
                ),
                '\s+', ' ', 'g'
            )
        );
    END;
    $func$;

    -- Para cada usuário, consolidar produtos duplicados
    FOR produto_record IN 
        SELECT 
            user_id,
            normalizar_nome_produto(produto_nome) as nome_norm,
            categoria,
            unidade_medida,
            SUM(quantidade) as total_quantidade,
            MAX(preco_unitario_ultimo) as ultimo_preco_unitario,
            MAX(updated_at) as ultima_atualizacao,
            MIN(id) as primeiro_id,
            COUNT(*) as total_produtos
        FROM estoque_app
        GROUP BY user_id, normalizar_nome_produto(produto_nome), categoria, unidade_medida
        HAVING COUNT(*) > 1
    LOOP
        -- Atualizar o primeiro produto com a quantidade total
        UPDATE estoque_app 
        SET 
            produto_nome = produto_record.nome_norm,
            quantidade = produto_record.total_quantidade,
            preco_unitario_ultimo = produto_record.ultimo_preco_unitario,
            updated_at = produto_record.ultima_atualizacao
        WHERE id = produto_record.primeiro_id;
        
        -- Deletar os produtos duplicados
        DELETE FROM estoque_app 
        WHERE user_id = produto_record.user_id 
          AND normalizar_nome_produto(produto_nome) = produto_record.nome_norm
          AND categoria = produto_record.categoria
          AND unidade_medida = produto_record.unidade_medida
          AND id != produto_record.primeiro_id;
          
        RAISE NOTICE 'Consolidado: % - Quantidade total: %', produto_record.nome_norm, produto_record.total_quantidade;
    END LOOP;
    
    -- Limpar função temporária
    DROP FUNCTION IF EXISTS normalizar_nome_produto(TEXT);
    
    RAISE NOTICE 'Consolidação de estoque concluída!';
END;
$$;

-- Executar a consolidação imediatamente
SELECT consolidar_estoque_duplicado();