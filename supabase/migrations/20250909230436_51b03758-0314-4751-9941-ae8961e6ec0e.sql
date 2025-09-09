-- Remover trigger e função problemáticos com CASCADE
DROP TRIGGER IF EXISTS trigger_atualizar_preco_usuario_inteligente ON estoque_app;
DROP FUNCTION IF EXISTS atualizar_preco_usuario_inteligente() CASCADE;

-- Limpar todos os registros incorretos de precos_atuais_usuario
DELETE FROM precos_atuais_usuario WHERE origem = 'manual';

-- Criar função que será chamada APÓS o processamento da nota fiscal
CREATE OR REPLACE FUNCTION sincronizar_precos_pos_processamento()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE
    produto_record RECORD;
    preco_geral_menor NUMERIC;
BEGIN
    -- Só executar se a nota foi processada e tem dados extraídos
    IF NEW.processada = true AND NEW.dados_extraidos IS NOT NULL AND 
       (OLD.processada IS NULL OR OLD.processada != true OR OLD.dados_extraidos IS NULL) THEN
        
        -- Para cada produto no estoque do usuário, verificar se precisa de preço manual
        FOR produto_record IN 
            SELECT ea.*, ea.preco_unitario_ultimo as preco_estoque
            FROM estoque_app ea
            WHERE ea.user_id = NEW.usuario_id
            AND ea.preco_unitario_ultimo IS NOT NULL 
            AND ea.preco_unitario_ultimo > 0
            AND NOT EXISTS (
                -- Verificar se o produto NÃO está na nota fiscal recém processada
                SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.dados_extraidos->'itens', '[]'::jsonb)) as item
                WHERE UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(ea.produto_nome))
                   OR UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(ea.produto_nome)) || '%'
                   OR UPPER(TRIM(ea.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
            )
            AND NOT EXISTS (
                -- E também não está em outras notas processadas
                SELECT 1 FROM notas_imagens ni 
                WHERE ni.usuario_id = NEW.usuario_id 
                AND ni.id != NEW.id
                AND ni.processada = true
                AND ni.dados_extraidos IS NOT NULL
                AND (
                    EXISTS (
                        SELECT 1 FROM jsonb_array_elements(COALESCE(ni.dados_extraidos->'itens', '[]'::jsonb)) as item
                        WHERE UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(ea.produto_nome))
                           OR UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(ea.produto_nome)) || '%'
                           OR UPPER(TRIM(ea.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
                    )
                )
            )
        LOOP
            -- Buscar preço de referência na tabela precos_atuais
            SELECT MIN(valor_unitario) INTO preco_geral_menor
            FROM precos_atuais pa
            WHERE UPPER(pa.produto_nome) = UPPER(produto_record.produto_nome)
               OR UPPER(pa.produto_nome) LIKE '%' || UPPER(produto_record.produto_nome) || '%'
               OR UPPER(produto_record.produto_nome) LIKE '%' || UPPER(pa.produto_nome) || '%';
            
            -- Inserir como preço manual (produto realmente inserido manualmente)
            INSERT INTO public.precos_atuais_usuario (
                user_id,
                produto_nome,
                valor_unitario,
                origem
            ) VALUES (
                NEW.usuario_id,
                produto_record.produto_nome,
                CASE 
                    WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < produto_record.preco_estoque 
                    THEN preco_geral_menor 
                    ELSE produto_record.preco_estoque 
                END,
                'manual'
            )
            ON CONFLICT (user_id, produto_nome) 
            DO UPDATE SET 
                valor_unitario = CASE 
                    WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < produto_record.preco_estoque 
                    THEN preco_geral_menor 
                    ELSE produto_record.preco_estoque 
                END,
                origem = 'manual',
                data_atualizacao = now(),
                updated_at = now();
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Criar trigger que executa APÓS o processamento da nota
CREATE TRIGGER sincronizar_precos_pos_processamento_trigger
    AFTER UPDATE ON notas_imagens
    FOR EACH ROW
    EXECUTE FUNCTION sincronizar_precos_pos_processamento();