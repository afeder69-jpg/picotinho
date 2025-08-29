-- Corrigir foreign key da tabela notas_fiscais para referenciar auth.users
-- e migrar dados das notas já processadas

-- Primeiro remover a foreign key atual
ALTER TABLE notas_fiscais DROP CONSTRAINT IF EXISTS notas_fiscais_user_id_fkey;

-- Migrar dados existentes das notas processadas
DO $$
DECLARE
    nota_record RECORD;
    dados_json JSONB;
    nota_fiscal_id UUID;
    item_record JSONB;
    data_compra_formatada DATE;
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
        
        -- Verificar se já existe uma nota fiscal para esta nota
        IF NOT EXISTS (
            SELECT 1 FROM notas_fiscais 
            WHERE user_id = nota_record.usuario_id 
            AND valor_total = (dados_json->'compra'->>'valor_total')::numeric
            AND mercado = dados_json->'estabelecimento'->>'nome'
        ) THEN
            
            -- Parse da data
            data_compra_formatada := NULL;
            IF dados_json->'compra'->>'data_emissao' IS NOT NULL THEN
                BEGIN
                    -- Assumindo formato brasileiro DD/MM/YYYY HH:MM:SS
                    data_compra_formatada := TO_DATE(
                        SPLIT_PART(dados_json->'compra'->>'data_emissao', ' ', 1), 
                        'DD/MM/YYYY'
                    );
                EXCEPTION WHEN OTHERS THEN
                    data_compra_formatada := NULL;
                END;
            END IF;
            
            -- Criar nota fiscal
            INSERT INTO notas_fiscais (
                user_id,
                mercado,
                cnpj,
                data_compra,
                valor_total,
                qtd_itens,
                chave_acesso
            ) VALUES (
                nota_record.usuario_id,
                COALESCE(dados_json->'estabelecimento'->>'nome', 'Não identificado'),
                dados_json->'estabelecimento'->>'cnpj',
                data_compra_formatada,
                COALESCE((dados_json->'compra'->>'valor_total')::numeric, 0),
                JSONB_ARRAY_LENGTH(COALESCE(dados_json->'itens', '[]'::jsonb)),
                dados_json->'compra'->>'numero'
            ) RETURNING id INTO nota_fiscal_id;
            
            -- Criar itens da nota
            IF dados_json->'itens' IS NOT NULL THEN
                FOR item_record IN SELECT * FROM JSONB_ARRAY_ELEMENTS(dados_json->'itens')
                LOOP
                    INSERT INTO itens_nota (
                        nota_id,
                        descricao,
                        codigo,
                        quantidade,
                        unidade,
                        valor_unitario,
                        valor_total,
                        categoria
                    ) VALUES (
                        nota_fiscal_id,
                        COALESCE(item_record->>'descricao', 'Item não identificado'),
                        item_record->>'codigo',
                        COALESCE((item_record->>'quantidade')::numeric, 0),
                        COALESCE(item_record->>'unidade', 'unidade'),
                        COALESCE((item_record->>'valor_unitario')::numeric, 0),
                        COALESCE((item_record->>'valor_total')::numeric, 0),
                        COALESCE(item_record->>'categoria', 'outros')
                    );
                END LOOP;
            END IF;
            
            RAISE NOTICE 'Migrada nota % com % itens', dados_json->'estabelecimento'->>'nome', JSONB_ARRAY_LENGTH(COALESCE(dados_json->'itens', '[]'::jsonb));
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Migração concluída!';
END $$;