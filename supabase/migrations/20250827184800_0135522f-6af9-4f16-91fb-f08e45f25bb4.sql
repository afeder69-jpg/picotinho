-- Função para consolidar produtos duplicados no estoque (versão corrigida)
CREATE OR REPLACE FUNCTION consolidar_estoque_duplicado()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    produto_record RECORD;
BEGIN
    -- Para cada grupo de produtos similares, manter apenas um e somar as quantidades
    FOR produto_record IN 
        SELECT 
            user_id,
            UPPER(TRIM(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(produto_nome, '\bGRAENC\b', 'GRANEL', 'gi'),
                        '\bFATIADO\b|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G\s*100\s*NUTRICAO|480G|180G\s*REQUEIJAO|3\.0', '', 'gi'
                    ),
                    '\s+', ' ', 'g'
                )
            )) as nome_normalizado,
            categoria,
            unidade_medida,
            SUM(quantidade) as quantidade_total,
            MAX(preco_unitario_ultimo) as preco_mais_recente,
            MAX(updated_at) as ultima_atualizacao,
            array_agg(id ORDER BY created_at) as ids_produtos,
            COUNT(*) as total_duplicatas
        FROM estoque_app
        GROUP BY 
            user_id,
            UPPER(TRIM(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(produto_nome, '\bGRAENC\b', 'GRANEL', 'gi'),
                        '\bFATIADO\b|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G\s*100\s*NUTRICAO|480G|180G\s*REQUEIJAO|3\.0', '', 'gi'
                    ),
                    '\s+', ' ', 'g'
                )
            )),
            categoria,
            unidade_medida
        HAVING COUNT(*) > 1
    LOOP
        -- Atualizar o primeiro produto com a quantidade consolidada
        UPDATE estoque_app 
        SET 
            produto_nome = produto_record.nome_normalizado,
            quantidade = produto_record.quantidade_total,
            preco_unitario_ultimo = produto_record.preco_mais_recente,
            updated_at = produto_record.ultima_atualizacao
        WHERE id = produto_record.ids_produtos[1];
        
        -- Deletar os produtos duplicados (mantendo apenas o primeiro)
        DELETE FROM estoque_app 
        WHERE id = ANY(produto_record.ids_produtos[2:]);
        
        RAISE NOTICE 'Consolidado: % produtos em 1 - Total: % %', 
            produto_record.total_duplicatas, 
            produto_record.quantidade_total, 
            produto_record.unidade_medida;
    END LOOP;
    
    RAISE NOTICE 'Consolidação de estoque concluída!';
END;
$$;

-- Executar a consolidação
SELECT consolidar_estoque_duplicado();