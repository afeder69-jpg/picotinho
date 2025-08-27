-- Melhorar o trigger de reversão de estoque para lidar melhor com nomes normalizados
CREATE OR REPLACE FUNCTION public.reverter_estoque_nota_excluida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    item_record RECORD;
    estoque_record RECORD;
    nova_quantidade NUMERIC;
    nome_normalizado TEXT;
    encontrado BOOLEAN;
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
        -- Aplicar exatamente a mesma normalização usada no processamento
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
        
        encontrado := FALSE;
        
        -- Buscar produto no estoque usando várias estratégias
        -- 1. Busca exata por nome normalizado
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
        
        -- Se não encontrou, tentar busca por similaridade
        IF NOT FOUND THEN
            SELECT * INTO estoque_record
            FROM estoque_app 
            WHERE user_id = OLD.usuario_id
            AND (
                UPPER(produto_nome) LIKE '%' || UPPER(TRIM(item_record.descricao)) || '%'
                OR UPPER(TRIM(item_record.descricao)) LIKE '%' || UPPER(produto_nome) || '%'
                OR similarity(UPPER(produto_nome), UPPER(item_record.descricao)) > 0.7
            )
            ORDER BY similarity(UPPER(produto_nome), UPPER(item_record.descricao)) DESC
            LIMIT 1;
        END IF;
        
        -- Se não encontrou, tentar busca mais flexível
        IF NOT FOUND THEN
            -- Tentar encontrar produtos que contenham palavras chave
            DECLARE
                palavras TEXT[];
                palavra TEXT;
            BEGIN
                palavras := string_to_array(UPPER(TRIM(item_record.descricao)), ' ');
                
                FOR palavra IN SELECT unnest(palavras) LOOP
                    IF LENGTH(palavra) > 3 THEN
                        SELECT * INTO estoque_record
                        FROM estoque_app 
                        WHERE user_id = OLD.usuario_id
                        AND UPPER(produto_nome) LIKE '%' || palavra || '%'
                        LIMIT 1;
                        
                        IF FOUND THEN
                            EXIT;
                        END IF;
                    END IF;
                END LOOP;
            END;
        END IF;
        
        IF FOUND THEN
            encontrado := TRUE;
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
                
            -- Se a quantidade ficou zero, remover o produto do estoque
            IF nova_quantidade = 0 THEN
                DELETE FROM estoque_app WHERE id = estoque_record.id;
                RAISE NOTICE 'Produto removido do estoque (quantidade zero): %', estoque_record.produto_nome;
            END IF;
        ELSE
            RAISE NOTICE 'ATENÇÃO: Produto não encontrado no estoque para reverter: % (normalizado: %)', 
                item_record.descricao, nome_normalizado;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Reversão de estoque concluída para nota ID: %', OLD.id;
    RETURN OLD;
END;
$$;

-- Adicionar extensão para função de similaridade se não existir
CREATE EXTENSION IF NOT EXISTS pg_trgm;