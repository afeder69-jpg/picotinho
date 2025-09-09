-- CORREÇÃO DE EMERGÊNCIA: Remover nota fiscal duplicada
-- Manter apenas a primeira nota (mais antiga) e remover a duplicata

-- 1. Primeiro reverter estoque da nota duplicada mais recente
DO $$
DECLARE
    nota_duplicada_id UUID := '273bb244-5e1f-4d26-b198-e336798700a3';
    item_record JSONB;
    estoque_record RECORD;
    nova_quantidade NUMERIC;
    nome_normalizado TEXT;
BEGIN
    RAISE NOTICE 'Revertendo estoque da nota duplicada: %', nota_duplicada_id;
    
    -- Buscar dados da nota duplicada
    SELECT dados_extraidos INTO item_record
    FROM notas_imagens 
    WHERE id = nota_duplicada_id;
    
    -- Se há itens, reverter do estoque
    IF item_record->'itens' IS NOT NULL THEN
        FOR item_record IN 
            SELECT * FROM JSONB_ARRAY_ELEMENTS(item_record->'itens')
            WHERE value->>'descricao' IS NOT NULL
            AND COALESCE((value->>'quantidade')::NUMERIC, 0) > 0
        LOOP
            nome_normalizado := UPPER(TRIM(item_record->>'descricao'));
            
            -- Buscar no estoque do usuário
            SELECT * INTO estoque_record
            FROM estoque_app 
            WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
            AND produto_nome = nome_normalizado;
            
            IF FOUND THEN
                nova_quantidade := GREATEST(0, estoque_record.quantidade - COALESCE((item_record->>'quantidade')::NUMERIC, 0));
                
                UPDATE estoque_app 
                SET quantidade = nova_quantidade
                WHERE id = estoque_record.id;
                
                RAISE NOTICE 'Estoque revertido: % (% -> %)', 
                    estoque_record.produto_nome, 
                    estoque_record.quantidade, 
                    nova_quantidade;
                    
                -- Se ficou zero, remover
                IF nova_quantidade = 0 THEN
                    DELETE FROM estoque_app WHERE id = estoque_record.id;
                    RAISE NOTICE 'Produto removido (quantidade zero): %', estoque_record.produto_nome;
                END IF;
            END IF;
        END LOOP;
    END IF;
END $$;

-- 2. Remover a nota duplicada (mais recente)
DELETE FROM notas_imagens 
WHERE id = '273bb244-5e1f-4d26-b198-e336798700a3';

-- 3. Verificar resultado final
SELECT 
    'APÓS LIMPEZA' as status,
    COUNT(*) as total_notas,
    SUM(CASE WHEN dados_extraidos->'compra'->>'chave_acesso' = '33250917493338000397653210000762611583195700' THEN 1 ELSE 0 END) as notas_com_chave_duplicada
FROM notas_imagens;