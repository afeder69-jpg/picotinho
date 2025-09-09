-- CORREÇÃO DEFINITIVA: O problema é timing - trigger executa antes da nota ser marcada como processada

-- Remover o trigger atual que está causando o problema
DROP TRIGGER IF EXISTS marcar_produto_manual_trigger ON estoque_app;
DROP FUNCTION IF EXISTS marcar_produto_manual_se_necessario() CASCADE;

-- Limpar todos os registros incorretos de produtos marcados como manuais
DELETE FROM precos_atuais_usuario;

-- Nova abordagem: em vez de trigger no estoque, criar trigger que roda APÓS nota ser processada
-- Isso garante que a verificação aconteça no momento correto

CREATE OR REPLACE FUNCTION verificar_precos_manuais_pos_nota()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE
    produto_record RECORD;
    preco_geral_menor NUMERIC;
    encontrado_em_nota BOOLEAN;
BEGIN
    -- Só executar quando uma nota for marcada como processada
    IF TG_OP = 'UPDATE' AND OLD.processada = false AND NEW.processada = true THEN
        
        -- Para cada produto no estoque do usuário, verificar se é realmente manual
        FOR produto_record IN 
            SELECT ea.* 
            FROM estoque_app ea 
            WHERE ea.user_id = NEW.usuario_id
        LOOP
            -- Verificar se este produto específico aparece em ALGUMA nota fiscal processada
            SELECT EXISTS (
                SELECT 1 FROM notas_imagens ni,
                    jsonb_array_elements(COALESCE(ni.dados_extraidos->'itens', '[]'::jsonb)) as item
                WHERE ni.usuario_id = NEW.usuario_id
                AND ni.processada = true
                AND ni.dados_extraidos IS NOT NULL
                AND (
                    -- Comparação exata (melhor match)
                    UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(produto_record.produto_nome))
                    OR
                    -- Comparação com normalização similar à edge function
                    UPPER(TRIM(REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            COALESCE(item->>'descricao', item->>'nome', ''),
                            '\b(250ML|200G|500G|1KG|1\.5L|2L|800G|1,6KG|45G|100G|980ML|\d+G|\d+ML|\d+L|\d+KG)\b', '', 'gi'
                        ),
                        '\s+', ' ', 'g'
                    ))) = UPPER(TRIM(REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            produto_record.produto_nome,
                            '\b(VD|TRADICIONAL|FINOS|CRISTAL|PRIMAVERA|SACHE|EXPLO\.|DE|FLORES|NATURAL|\d+G|\d+ML|\d+L|\d+KG)\b', '', 'gi'
                        ),
                        '\s+', ' ', 'g'
                    )))
                )
            ) INTO encontrado_em_nota;
            
            -- Se o produto NÃO foi encontrado em nenhuma nota, é realmente manual
            IF NOT encontrado_em_nota AND produto_record.preco_unitario_ultimo IS NOT NULL AND produto_record.preco_unitario_ultimo > 0 THEN
                
                -- Buscar preço de referência
                SELECT MIN(valor_unitario) INTO preco_geral_menor
                FROM precos_atuais pa
                WHERE UPPER(pa.produto_nome) = UPPER(produto_record.produto_nome)
                   OR UPPER(pa.produto_nome) LIKE '%' || UPPER(produto_record.produto_nome) || '%'
                   OR UPPER(produto_record.produto_nome) LIKE '%' || UPPER(pa.produto_nome) || '%';
                
                -- Inserir como preço manual
                INSERT INTO public.precos_atuais_usuario (
                    user_id,
                    produto_nome,
                    valor_unitario,
                    origem
                ) VALUES (
                    produto_record.user_id,
                    produto_record.produto_nome,
                    CASE 
                        WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < produto_record.preco_unitario_ultimo 
                        THEN preco_geral_menor 
                        ELSE produto_record.preco_unitario_ultimo 
                    END,
                    'manual'
                )
                ON CONFLICT (user_id, produto_nome) 
                DO UPDATE SET 
                    valor_unitario = CASE 
                        WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < produto_record.preco_unitario_ultimo 
                        THEN preco_geral_menor 
                        ELSE produto_record.preco_unitario_ultimo 
                    END,
                    origem = 'manual',
                    data_atualizacao = now(),
                    updated_at = now();
                    
                RAISE NOTICE 'Produto genuinamente manual encontrado: %', produto_record.produto_nome;
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Criar trigger que executa APÓS nota ser processada (timing correto)
CREATE TRIGGER verificar_precos_manuais_trigger
    AFTER UPDATE ON notas_imagens
    FOR EACH ROW
    EXECUTE FUNCTION verificar_precos_manuais_pos_nota();