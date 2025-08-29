-- Corrigir função recalcular_estoque_usuario para usar dados das notas fiscais
CREATE OR REPLACE FUNCTION public.recalcular_estoque_usuario(usuario_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    nota_record RECORD;
    item_record JSONB;
    nome_normalizado TEXT;
    estoque_record RECORD;
    normalizacao_record RECORD;
BEGIN
    -- Verificar se o usuário pode recalcular apenas seu próprio estoque
    IF auth.uid() != usuario_uuid THEN
        RAISE EXCEPTION 'Acesso negado: você só pode recalcular seu próprio estoque';
    END IF;
    
    -- Primeiro limpar o estoque atual
    DELETE FROM estoque_app WHERE user_id = usuario_uuid;
    
    RAISE NOTICE 'Recalculando estoque para usuário: % baseado nas notas fiscais processadas', usuario_uuid;
    
    -- Iterar sobre todas as notas processadas do usuário que têm dados extraídos
    FOR nota_record IN 
        SELECT id, usuario_id, dados_extraidos 
        FROM notas_imagens 
        WHERE usuario_id = usuario_uuid
        AND processada = true 
        AND dados_extraidos IS NOT NULL
        AND dados_extraidos::text != '{}'::text
    LOOP
        -- Processar itens da nota para o estoque
        IF nota_record.dados_extraidos->'itens' IS NOT NULL THEN
            FOR item_record IN 
                SELECT * FROM JSONB_ARRAY_ELEMENTS(nota_record.dados_extraidos->'itens')
                WHERE value->>'descricao' IS NOT NULL
                AND COALESCE((value->>'quantidade')::numeric, 0) > 0
            LOOP
                BEGIN
                    -- Normalizar nome do produto (mesma lógica da edge function)
                    nome_normalizado := UPPER(TRIM(item_record->>'descricao'));
                    
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
                    
                    -- Aplicar normalizações de padrões específicos
                    nome_normalizado := TRIM(REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(nome_normalizado, '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b', 'PAO DE FORMA', 'gi'),
                                '\b(ACHOCOLATADO EM PO NESCAU)\s*(380G|3\.0|30KG|\d+G)?\b', 'ACHOCOLATADO EM PO', 'gi'
                            ),
                            '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL|\d+G|\d+ML|\d+L|\d+KG)\b', '', 'gi'
                        ),
                        '\s+', ' ', 'g'
                    ));
                    
                    -- Verificar se produto já existe no estoque
                    SELECT * INTO estoque_record
                    FROM estoque_app 
                    WHERE user_id = usuario_uuid 
                    AND produto_nome = nome_normalizado;
                    
                    IF FOUND THEN
                        -- Atualizar quantidade existente
                        UPDATE estoque_app 
                        SET 
                            quantidade = quantidade + COALESCE((item_record->>'quantidade')::numeric, 0),
                            preco_unitario_ultimo = COALESCE((item_record->>'valor_unitario')::numeric, preco_unitario_ultimo),
                            updated_at = now()
                        WHERE id = estoque_record.id;
                        
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
                            usuario_uuid,
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
    
    RAISE NOTICE 'Recálculo de estoque concluído para usuário: %', usuario_uuid;
END;
$function$;