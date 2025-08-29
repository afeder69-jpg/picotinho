-- Migrar dados das notas já processadas para o estoque
DO $$
DECLARE
    nota_record RECORD;
    dados_json JSONB;
    item_record JSONB;
    nome_normalizado TEXT;
    estoque_existente_record RECORD;
BEGIN
    -- Buscar todas as notas processadas que têm dados extraídos
    FOR nota_record IN 
        SELECT id, usuario_id, dados_extraidos 
        FROM notas_imagens 
        WHERE processada = true 
        AND dados_extraidos IS NOT NULL
        AND dados_extraidos::text != '{}'::text
    LOOP
        dados_json := nota_record.dados_extraidos;
        
        -- Processar itens da nota para o estoque
        IF dados_json->'itens' IS NOT NULL THEN
            FOR item_record IN SELECT * FROM JSONB_ARRAY_ELEMENTS(dados_json->'itens')
            LOOP
                BEGIN
                    -- Normalizar nome do produto (mesma lógica da edge function)
                    nome_normalizado := UPPER(TRIM(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(
                                    item_record->>'descricao',
                                    '\b(GRAENC|GRANEL)\b', 'GRANEL', 'gi'
                                ),
                                '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b', 'PAO DE FORMA', 'gi'
                            ),
                            '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|\d+G|\d+ML|\d+L)\b', '', 'gi'
                        )
                    ));
                    
                    -- Verificar se produto já existe no estoque
                    SELECT * INTO estoque_existente_record
                    FROM estoque_app 
                    WHERE user_id = nota_record.usuario_id 
                    AND produto_nome = nome_normalizado;
                    
                    IF FOUND THEN
                        -- Atualizar quantidade existente
                        UPDATE estoque_app 
                        SET 
                            quantidade = quantidade + COALESCE((item_record->>'quantidade')::numeric, 0),
                            preco_unitario_ultimo = COALESCE((item_record->>'valor_unitario')::numeric, 0),
                            updated_at = now()
                        WHERE id = estoque_existente_record.id;
                        
                        RAISE NOTICE 'Estoque atualizado: % (+ %)', nome_normalizado, item_record->>'quantidade';
                    ELSE
                        -- Criar novo item no estoque
                        INSERT INTO estoque_app (
                            user_id,
                            produto_nome,
                            categoria,
                            quantidade,
                            unidade_medida,
                            preco_unitario_ultimo
                        ) VALUES (
                            nota_record.usuario_id,
                            nome_normalizado,
                            COALESCE(item_record->>'categoria', 'outros'),
                            COALESCE((item_record->>'quantidade')::numeric, 0),
                            COALESCE(item_record->>'unidade', 'unidade'),
                            COALESCE((item_record->>'valor_unitario')::numeric, 0)
                        );
                        
                        RAISE NOTICE 'Novo item no estoque: % (%)', nome_normalizado, item_record->>'quantidade';
                    END IF;
                    
                EXCEPTION WHEN OTHERS THEN
                    RAISE NOTICE 'Erro ao processar item %: %', item_record->>'descricao', SQLERRM;
                END;
            END LOOP;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Migração do estoque concluída!';
END $$;