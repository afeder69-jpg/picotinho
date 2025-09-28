-- Reverter mudanças da migration 20250928125417_50f946b8-cba2-49f2-9604-75383561789f
-- Remover trigger que foi adicionado
DROP TRIGGER IF EXISTS trigger_reverter_estoque_nota_excluida ON notas_imagens;

-- Restaurar função original (que deleta produtos com quantidade zero)
CREATE OR REPLACE FUNCTION public.reverter_estoque_nota_excluida()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    item_record RECORD;
    estoque_record RECORD;
    nova_quantidade NUMERIC;
    nome_normalizado TEXT;
    encontrado BOOLEAN;
    normalizacao_record RECORD;
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
        -- Aplicar a mesma normalização usada no processamento usando a tabela
        nome_normalizado := UPPER(TRIM(item_record.descricao));
        
        -- Aplicar normalizações da tabela
        FOR normalizacao_record IN 
            SELECT termo_errado, termo_correto 
            FROM normalizacoes_nomes 
            WHERE ativo = true
        LOOP
            nome_normalizado := REGEXP_REPLACE(
                nome_normalizado, 
                '\b' || normalizacao_record.termo_errado || '\b', 
                normalizacao_record.termo_correto, 
                'gi'
            );
        END LOOP;
        
        -- Aplicar normalizações de padrões específicos (igual ao código da edge function)
        nome_normalizado := REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(nome_normalizado, '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b', 'PAO DE FORMA', 'gi'),
                    '\b(ACHOCOLATADO EM PO NESCAU)\s*(380G|3\.0|30KG|\d+G)?\b', 'ACHOCOLATADO EM PO', 'gi'
                ),
                '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL|\d+G|\d+ML|\d+L|\d+KG)\b', '', 'gi'
            ),
            '\s+', ' ', 'g'
        );
        
        nome_normalizado := TRIM(nome_normalizado);
        
        encontrado := FALSE;
        
        -- Buscar produto no estoque usando várias estratégias
        -- 1. Busca exata por nome normalizado
        SELECT * INTO estoque_record
        FROM estoque_app 
        WHERE user_id = OLD.usuario_id
        AND produto_nome = nome_normalizado
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
        
        IF FOUND THEN
            encontrado := TRUE;
            -- Calcular nova quantidade (não pode ficar negativa)
            nova_quantidade := GREATEST(0, estoque_record.quantidade - item_record.quantidade);
            
            -- Se a quantidade ficar zero, deletar o produto
            IF nova_quantidade = 0 THEN
                DELETE FROM estoque_app WHERE id = estoque_record.id;
                RAISE NOTICE 'Produto deletado do estoque (quantidade zerada): %', estoque_record.produto_nome;
            ELSE
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
            END IF;
        ELSE
            RAISE NOTICE 'ATENÇÃO: Produto não encontrado no estoque para reverter: % (normalizado: %)', 
                item_record.descricao, nome_normalizado;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Reversão de estoque concluída para nota ID: %', OLD.id;
    RETURN OLD;
END;
$function$;