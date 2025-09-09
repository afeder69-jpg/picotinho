-- Remover o trigger problemático que está marcando produtos incorretamente como manuais
DROP TRIGGER IF EXISTS sincronizar_precos_pos_processamento_trigger ON notas_imagens;
DROP FUNCTION IF EXISTS sincronizar_precos_pos_processamento() CASCADE;

-- Limpar TODOS os registros de precos_atuais_usuario para resetar
DELETE FROM precos_atuais_usuario;

-- A nova estratégia é mais simples: produtos só devem ser marcados como manuais
-- quando são inseridos diretamente no estoque, não através de notas fiscais.
-- Vamos criar um trigger simples no estoque que marca como manual apenas
-- quando o produto é inserido E não está relacionado a nenhuma nota fiscal.

CREATE OR REPLACE FUNCTION marcar_produto_manual_se_necessario()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE
    preco_geral_menor NUMERIC;
    produto_em_nota BOOLEAN := false;
BEGIN
    -- Só executar para INSERT
    IF TG_OP = 'INSERT' THEN
        
        -- Verificar se o produto aparece em alguma nota fiscal do usuário
        SELECT EXISTS (
            SELECT 1 FROM notas_imagens ni 
            WHERE ni.usuario_id = NEW.user_id
            AND ni.processada = true
            AND ni.dados_extraidos IS NOT NULL
            AND (
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements(COALESCE(ni.dados_extraidos->'itens', '[]'::jsonb)) as item
                    WHERE UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(NEW.produto_nome))
                       OR UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(NEW.produto_nome)) || '%'
                       OR UPPER(TRIM(NEW.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
                )
            )
        ) INTO produto_em_nota;
        
        -- Se o produto NÃO está em nenhuma nota fiscal, é manual
        IF NOT produto_em_nota AND NEW.preco_unitario_ultimo IS NOT NULL AND NEW.preco_unitario_ultimo > 0 THEN
            
            -- Buscar preço de referência na tabela precos_atuais
            SELECT MIN(valor_unitario) INTO preco_geral_menor
            FROM precos_atuais pa
            WHERE UPPER(pa.produto_nome) = UPPER(NEW.produto_nome)
               OR UPPER(pa.produto_nome) LIKE '%' || UPPER(NEW.produto_nome) || '%'
               OR UPPER(NEW.produto_nome) LIKE '%' || UPPER(pa.produto_nome) || '%';
            
            -- Inserir como preço manual
            INSERT INTO public.precos_atuais_usuario (
                user_id,
                produto_nome,
                valor_unitario,
                origem
            ) VALUES (
                NEW.user_id,
                NEW.produto_nome,
                CASE 
                    WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < NEW.preco_unitario_ultimo 
                    THEN preco_geral_menor 
                    ELSE NEW.preco_unitario_ultimo 
                END,
                'manual'
            )
            ON CONFLICT (user_id, produto_nome) 
            DO UPDATE SET 
                valor_unitario = CASE 
                    WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < NEW.preco_unitario_ultimo 
                    THEN preco_geral_menor 
                    ELSE NEW.preco_unitario_ultimo 
                END,
                origem = 'manual',
                data_atualizacao = now(),
                updated_at = now();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Criar trigger que executa APENAS no INSERT do estoque
CREATE TRIGGER marcar_produto_manual_trigger
    AFTER INSERT ON estoque_app
    FOR EACH ROW
    EXECUTE FUNCTION marcar_produto_manual_se_necessario();