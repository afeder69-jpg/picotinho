-- Corrigir a função de diagnóstico removendo format() problemático
CREATE OR REPLACE FUNCTION public.diagnosticar_e_corrigir_estoque(usuario_uuid uuid)
RETURNS TABLE(
    tipo_problema text,
    detalhes text,
    valor_encontrado numeric,
    acao_realizada text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    total_notas numeric := 0;
    total_estoque numeric := 0;
    total_corrigido numeric := 0;
    produtos_zerados integer := 0;
    produtos_sem_preco integer := 0;
    nota_record RECORD;
    item_record JSONB;
    nome_normalizado TEXT;
    estoque_record RECORD;
    normalizacao_record RECORD;
    diferenca numeric;
BEGIN
    -- Verificar se o usuário pode diagnosticar apenas seu próprio estoque
    IF auth.uid() != usuario_uuid THEN
        RAISE EXCEPTION 'Acesso negado: você só pode diagnosticar seu próprio estoque';
    END IF;
    
    -- 1. Calcular valor total das notas fiscais ativas
    SELECT COALESCE(SUM(
        CASE 
            WHEN dados_extraidos->'compra'->>'valor_total' IS NOT NULL 
            THEN (dados_extraidos->'compra'->>'valor_total')::numeric
            WHEN dados_extraidos->>'valorTotal' IS NOT NULL 
            THEN (dados_extraidos->>'valorTotal')::numeric
            ELSE 0
        END
    ), 0) INTO total_notas
    FROM notas_imagens 
    WHERE usuario_id = usuario_uuid 
    AND processada = true 
    AND dados_extraidos IS NOT NULL;
    
    RETURN QUERY SELECT 
        'VALOR_NOTAS_FISCAIS'::text,
        'Total das notas fiscais processadas'::text,
        total_notas,
        'Cálculo realizado'::text;
    
    -- 2. Calcular valor atual do estoque
    SELECT COALESCE(SUM(quantidade * COALESCE(preco_unitario_ultimo, 0)), 0) INTO total_estoque
    FROM estoque_app 
    WHERE user_id = usuario_uuid 
    AND quantidade > 0;
    
    RETURN QUERY SELECT 
        'VALOR_ESTOQUE_ATUAL'::text,
        'Total do estoque considerando apenas produtos com quantidade > 0'::text,
        total_estoque,
        'Cálculo realizado'::text;
    
    -- 3. Verificar produtos zerados no estoque
    SELECT COUNT(*) INTO produtos_zerados
    FROM estoque_app 
    WHERE user_id = usuario_uuid 
    AND quantidade = 0;
    
    IF produtos_zerados > 0 THEN
        RETURN QUERY SELECT 
            'PRODUTOS_ZERADOS'::text,
            produtos_zerados::text || ' produtos com quantidade zero encontrados',
            produtos_zerados::numeric,
            'Produtos zerados detectados - devem ser removidos da visualização'::text;
        
        -- Remover produtos zerados
        DELETE FROM estoque_app 
        WHERE user_id = usuario_uuid 
        AND quantidade = 0;
        
        RETURN QUERY SELECT 
            'LIMPEZA_ZERADOS'::text,
            'Produtos zerados removidos do estoque'::text,
            produtos_zerados::numeric,
            'Produtos removidos da base de dados'::text;
    END IF;
    
    -- 4. Verificar produtos sem preço
    SELECT COUNT(*) INTO produtos_sem_preco
    FROM estoque_app 
    WHERE user_id = usuario_uuid 
    AND quantidade > 0 
    AND (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo = 0);
    
    IF produtos_sem_preco > 0 THEN
        RETURN QUERY SELECT 
            'PRODUTOS_SEM_PRECO'::text,
            produtos_sem_preco::text || ' produtos sem preço encontrados',
            produtos_sem_preco::numeric,
            'Produtos sem preço detectados - afetam cálculo total'::text;
    END IF;
    
    -- 5. Calcular diferença final
    diferenca := total_notas - total_estoque;
    
    RETURN QUERY SELECT 
        'DIFERENCA_CALCULADA'::text,
        'Diferença entre notas (' || total_notas::text || ') e estoque (' || total_estoque::text || ')',
        diferenca,
        CASE 
            WHEN ABS(diferenca) < 0.01 THEN 'Valores consistentes'
            WHEN diferenca > 0 THEN 'Estoque menor que o esperado - possível problema na reversão'
            ELSE 'Estoque maior que o esperado - possível duplicação'
        END;
    
    -- 6. Se há diferença significativa, tentar recalcular estoque baseado nas notas
    IF ABS(diferenca) > 0.01 THEN
        RETURN QUERY SELECT 
            'RECALCULO_NECESSARIO'::text,
            'Diferença significativa detectada - iniciando recálculo'::text,
            diferenca,
            'Recalculando estoque baseado nas notas fiscais'::text;
        
        -- Limpar estoque atual
        DELETE FROM estoque_app WHERE user_id = usuario_uuid;
        
        -- Recriar estoque baseado nas notas fiscais
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
                        -- Normalizar nome do produto
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
                        END IF;
                        
                    EXCEPTION WHEN OTHERS THEN
                        RAISE NOTICE 'Erro ao processar item %: %', item_record->>'descricao', SQLERRM;
                    END;
                END LOOP;
            END IF;
        END LOOP;
        
        -- Calcular novo total do estoque
        SELECT COALESCE(SUM(quantidade * COALESCE(preco_unitario_ultimo, 0)), 0) INTO total_corrigido
        FROM estoque_app 
        WHERE user_id = usuario_uuid 
        AND quantidade > 0;
        
        RETURN QUERY SELECT 
            'ESTOQUE_RECALCULADO'::text,
            'Estoque recalculado baseado nas notas fiscais'::text,
            total_corrigido,
            'Novo valor do estoque: ' || total_corrigido::text || ' (diferença: ' || (total_notas - total_corrigido)::text || ')';
    END IF;
    
    RAISE NOTICE 'Diagnóstico concluído para usuário: %', usuario_uuid;
    
END;
$$;