-- Função para limpar preços incorretamente marcados como manuais
-- quando os produtos vieram de notas fiscais reprocessadas
CREATE OR REPLACE FUNCTION public.corrigir_produtos_marcados_incorretamente_como_manuais()
RETURNS TABLE(produtos_corrigidos integer, detalhes text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    produtos_incorretos integer := 0;
    usuario_id uuid;
    produto_record RECORD;
BEGIN
    -- Obter o ID do usuário autenticado
    SELECT auth.uid() INTO usuario_id;
    
    IF usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;
    
    -- Buscar produtos marcados como 'manual' que aparecem em notas fiscais processadas
    FOR produto_record IN 
        SELECT pau.id, pau.produto_nome, pau.user_id
        FROM precos_atuais_usuario pau
        WHERE pau.user_id = usuario_id
        AND pau.origem = 'manual'
        AND EXISTS (
            -- Verificar se o produto aparece em alguma nota fiscal processada
            SELECT 1 FROM notas_imagens ni
            WHERE ni.usuario_id = usuario_id
            AND ni.processada = true
            AND ni.dados_extraidos IS NOT NULL
            AND (
                -- Buscar no array de itens das notas
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements(ni.dados_extraidos->'itens') as item
                    WHERE (
                        -- Normalizar e comparar nomes
                        UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) = UPPER(TRIM(pau.produto_nome))
                        OR UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(pau.produto_nome)) || '%'
                        OR UPPER(TRIM(pau.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
                    )
                )
            )
        )
    LOOP
        -- Deletar o preço incorretamente marcado como manual
        DELETE FROM precos_atuais_usuario 
        WHERE id = produto_record.id;
        
        produtos_incorretos := produtos_incorretos + 1;
        
        RAISE NOTICE 'Produto corrigido: % (não é manual, veio de nota fiscal)', produto_record.produto_nome;
    END LOOP;
    
    RETURN QUERY SELECT 
        produtos_incorretos,
        CASE 
            WHEN produtos_incorretos = 0 THEN 'Nenhum produto incorreto encontrado'
            ELSE produtos_incorretos::text || ' produtos corrigidos - removidos preços incorretamente marcados como manuais'
        END;
        
    RAISE NOTICE 'Correção concluída: % produtos corrigidos', produtos_incorretos;
END;
$$;