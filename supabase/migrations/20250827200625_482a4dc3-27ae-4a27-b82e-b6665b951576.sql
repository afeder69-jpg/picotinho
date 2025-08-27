-- Criar trigger para reverter estoque quando nota for excluída
CREATE OR REPLACE FUNCTION reverter_estoque_nota_excluida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    item_record RECORD;
    estoque_record RECORD;
    nova_quantidade NUMERIC;
BEGIN
    -- Log da operação
    RAISE NOTICE 'Revertendo estoque da nota ID: %', OLD.id;
    
    -- Se a nota não foi processada, não há estoque para reverter
    IF NOT OLD.processada THEN
        RAISE NOTICE 'Nota % não foi processada, nada para reverter', OLD.id;
        RETURN OLD;
    END IF;
    
    -- Se não há dados extraídos, não há como reverter
    IF OLD.dados_extraidos IS NULL THEN
        RAISE NOTICE 'Nota % não possui dados extraídos, nada para reverter', OLD.id;
        RETURN OLD;
    END IF;
    
    -- Iterar sobre os itens da nota fiscal extraída
    FOR item_record IN 
        SELECT 
            item->>'descricao' as descricao,
            COALESCE((item->>'quantidade')::NUMERIC, 0) as quantidade
        FROM jsonb_array_elements(OLD.dados_extraidos->'itens') as item
        WHERE item->>'descricao' IS NOT NULL
        AND COALESCE((item->>'quantidade')::NUMERIC, 0) > 0
    LOOP
        -- Normalizar nome do produto para encontrar no estoque
        -- Aplicar a mesma lógica de normalização usada na inserção
        DECLARE
            nome_normalizado TEXT;
        BEGIN
            nome_normalizado := UPPER(TRIM(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(item_record.descricao, '\b(GRAENC|GRANEL)\b', 'GRANEL', 'gi'),
                            '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b', 'PAO DE FORMA', 'gi'
                        ),
                        '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|\d+G|\d+ML|\d+L)\b', '', 'gi'
                    ),
                    '\s+', ' ', 'g'
                )
            ));
            
            -- Buscar produto no estoque do usuário
            SELECT * INTO estoque_record
            FROM estoque_app 
            WHERE user_id = OLD.usuario_id
            AND UPPER(TRIM(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(produto_nome, '\b(GRAENC|GRANEL)\b', 'GRANEL', 'gi'),
                            '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b', 'PAO DE FORMA', 'gi'
                        ),
                        '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|\d+G|\d+ML|\d+L)\b', '', 'gi'
                    ),
                    '\s+', ' ', 'g'
                )
            )) = nome_normalizado
            LIMIT 1;
            
            IF FOUND THEN
                -- Calcular nova quantidade (não pode ficar negativa)
                nova_quantidade := GREATEST(0, estoque_record.quantidade - item_record.quantidade);
                
                -- Atualizar estoque
                UPDATE estoque_app 
                SET 
                    quantidade = nova_quantidade,
                    updated_at = now()
                WHERE id = estoque_record.id;
                
                RAISE NOTICE 'Estoque revertido: % (% - % = %)', 
                    estoque_record.produto_nome, 
                    estoque_record.quantidade, 
                    item_record.quantidade, 
                    nova_quantidade;
                    
                -- Se a quantidade ficou zero, considerar remover o produto do estoque
                IF nova_quantidade = 0 THEN
                    DELETE FROM estoque_app WHERE id = estoque_record.id;
                    RAISE NOTICE 'Produto removido do estoque (quantidade zero): %', estoque_record.produto_nome;
                END IF;
            ELSE
                RAISE NOTICE 'Produto não encontrado no estoque para reverter: % (normalizado: %)', 
                    item_record.descricao, nome_normalizado;
            END IF;
        END;
    END LOOP;
    
    RAISE NOTICE 'Reversão de estoque concluída para nota ID: %', OLD.id;
    RETURN OLD;
END;
$$;

-- Criar o trigger para executar a função antes de deletar uma nota
DROP TRIGGER IF EXISTS trigger_reverter_estoque_nota_excluida ON notas_imagens;
CREATE TRIGGER trigger_reverter_estoque_nota_excluida
    BEFORE DELETE ON notas_imagens
    FOR EACH ROW
    EXECUTE FUNCTION reverter_estoque_nota_excluida();