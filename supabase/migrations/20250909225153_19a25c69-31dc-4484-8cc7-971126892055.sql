-- Remover trigger que estava criando preços como 'manual' incorretamente
-- Esse trigger estava sendo acionado quando produtos de notas fiscais eram inseridos/atualizados
DROP TRIGGER IF EXISTS sincronizar_preco_manual_trigger ON estoque_app;
DROP FUNCTION IF EXISTS public.sincronizar_preco_manual();

-- Criar um trigger mais específico que NUNCA marca produtos como 'manual' 
-- se eles vieram de processamento de notas fiscais
CREATE OR REPLACE FUNCTION public.atualizar_preco_usuario_automatico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    preco_geral_menor NUMERIC;
    veio_de_nota_fiscal BOOLEAN := false;
BEGIN
    -- IMPORTANTE: Verificar se o produto veio de uma nota fiscal processada
    -- Se sim, NÃO criar entrada na tabela precos_atuais_usuario com origem 'manual'
    
    -- Verificar se existe uma nota fiscal processada com este produto
    SELECT EXISTS (
        SELECT 1 FROM notas_imagens ni 
        WHERE ni.usuario_id = NEW.user_id
        AND ni.processada = true
        AND ni.dados_extraidos IS NOT NULL
        AND (
            -- Buscar no JSON de itens da nota
            EXISTS (
                SELECT 1 FROM jsonb_array_elements(ni.dados_extraidos->'itens') as item
                WHERE UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(NEW.produto_nome))
                   OR UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(NEW.produto_nome)) || '%'
                   OR UPPER(TRIM(NEW.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
            )
            OR
            -- Buscar no JSON de produtos (formato alternativo)
            EXISTS (
                SELECT 1 FROM jsonb_array_elements(ni.dados_extraidos->'produtos') as produto
                WHERE UPPER(TRIM(COALESCE(produto->>'nome', ''))) = UPPER(TRIM(NEW.produto_nome))
                   OR UPPER(TRIM(COALESCE(produto->>'nome', ''))) LIKE '%' || UPPER(TRIM(NEW.produto_nome)) || '%'
                   OR UPPER(TRIM(NEW.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(produto->>'nome', ''))) || '%'
            )
        )
    ) INTO veio_de_nota_fiscal;
    
    -- Se o produto veio de nota fiscal, não criar preço como 'manual'
    IF veio_de_nota_fiscal THEN
        RAISE NOTICE 'Produto % veio de nota fiscal - não será marcado como manual', NEW.produto_nome;
        RETURN NEW;
    END IF;
    
    -- Só processar para produtos realmente inseridos manualmente
    IF NEW.preco_unitario_ultimo IS NOT NULL AND NEW.preco_unitario_ultimo > 0 THEN
        -- Verificar se existe um preço menor na tabela de preços gerais
        SELECT MIN(valor_unitario) INTO preco_geral_menor
        FROM precos_atuais pa
        WHERE UPPER(pa.produto_nome) = UPPER(NEW.produto_nome)
           OR UPPER(pa.produto_nome) LIKE '%' || UPPER(NEW.produto_nome) || '%'
           OR UPPER(NEW.produto_nome) LIKE '%' || UPPER(pa.produto_nome) || '%';
        
        -- Criar preço do usuário apenas se for realmente manual
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
            'manual'  -- Agora só marca como manual se realmente for manual
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
    
    RETURN NEW;
END;
$$;

-- Criar novo trigger com a função corrigida
CREATE TRIGGER atualizar_preco_usuario_automatico_trigger
    AFTER INSERT OR UPDATE ON estoque_app
    FOR EACH ROW
    EXECUTE FUNCTION public.atualizar_preco_usuario_automatico();