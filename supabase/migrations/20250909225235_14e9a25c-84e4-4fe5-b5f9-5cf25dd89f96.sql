-- Primeiro remover o trigger e depois a função
DROP TRIGGER IF EXISTS trigger_sincronizar_preco_manual ON estoque_app;
DROP FUNCTION IF EXISTS public.sincronizar_preco_manual();

-- Criar uma função melhorada que detecta corretamente se um produto veio de nota fiscal
CREATE OR REPLACE FUNCTION public.atualizar_preco_usuario_inteligente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    preco_geral_menor NUMERIC;
    veio_de_nota_fiscal BOOLEAN := false;
BEGIN
    -- Verificar se o produto existe em alguma nota fiscal processada
    SELECT EXISTS (
        SELECT 1 FROM notas_imagens ni 
        WHERE ni.usuario_id = NEW.user_id
        AND ni.processada = true
        AND ni.dados_extraidos IS NOT NULL
        AND (
            -- Buscar no array de itens
            EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(ni.dados_extraidos->'itens', '[]'::jsonb)) as item
                WHERE UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(NEW.produto_nome))
                   OR UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(NEW.produto_nome)) || '%'
                   OR UPPER(TRIM(NEW.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
            )
            OR
            -- Buscar no array de produtos 
            EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(ni.dados_extraidos->'produtos', '[]'::jsonb)) as produto
                WHERE UPPER(TRIM(COALESCE(produto->>'nome', ''))) = UPPER(TRIM(NEW.produto_nome))
                   OR UPPER(TRIM(COALESCE(produto->>'nome', ''))) LIKE '%' || UPPER(TRIM(NEW.produto_nome)) || '%'
                   OR UPPER(TRIM(NEW.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(produto->>'nome', ''))) || '%'
            )
        )
    ) INTO veio_de_nota_fiscal;
    
    -- Se o produto veio de nota fiscal, NÃO criar como manual
    IF veio_de_nota_fiscal THEN
        RETURN NEW;
    END IF;
    
    -- Só criar preço manual para produtos realmente inseridos manualmente
    IF NEW.preco_unitario_ultimo IS NOT NULL AND NEW.preco_unitario_ultimo > 0 THEN
        SELECT MIN(valor_unitario) INTO preco_geral_menor
        FROM precos_atuais pa
        WHERE UPPER(pa.produto_nome) = UPPER(NEW.produto_nome)
           OR UPPER(pa.produto_nome) LIKE '%' || UPPER(NEW.produto_nome) || '%'
           OR UPPER(NEW.produto_nome) LIKE '%' || UPPER(pa.produto_nome) || '%';
        
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
    
    RETURN NEW;
END;
$$;

-- Criar o trigger corrigido
CREATE TRIGGER trigger_atualizar_preco_usuario_inteligente
    AFTER INSERT OR UPDATE ON estoque_app
    FOR EACH ROW
    EXECUTE FUNCTION public.atualizar_preco_usuario_inteligente();