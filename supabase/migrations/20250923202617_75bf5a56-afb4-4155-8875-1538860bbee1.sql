-- Função para limpeza completa de resíduos de um usuário específico
CREATE OR REPLACE FUNCTION public.limpar_residuos_usuario_completo(target_user_id uuid)
RETURNS TABLE(tabela_limpa text, registros_removidos integer, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    registros_count integer;
BEGIN
    -- 1. Limpar itens_compra_app
    DELETE FROM itens_compra_app 
    WHERE compra_id IN (
        SELECT id FROM compras_app WHERE user_id = target_user_id
    );
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'itens_compra_app'::text, registros_count, 'limpo'::text;
    
    -- 2. Limpar compras_app
    DELETE FROM compras_app WHERE user_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'compras_app'::text, registros_count, 'limpo'::text;
    
    -- 3. Limpar itens_nota
    DELETE FROM itens_nota 
    WHERE nota_id IN (
        SELECT id FROM notas_fiscais WHERE user_id = target_user_id
    );
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'itens_nota'::text, registros_count, 'limpo'::text;
    
    -- 4. Limpar receipt_items
    DELETE FROM receipt_items 
    WHERE receipt_id IN (
        SELECT id FROM receipts WHERE user_id = target_user_id
    );
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'receipt_items'::text, registros_count, 'limpo'::text;
    
    -- 5. Limpar receipts
    DELETE FROM receipts WHERE user_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'receipts'::text, registros_count, 'limpo'::text;
    
    -- 6. Limpar notas_fiscais
    DELETE FROM notas_fiscais WHERE user_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'notas_fiscais'::text, registros_count, 'limpo'::text;
    
    -- 7. Limpar notas_imagens
    DELETE FROM notas_imagens WHERE usuario_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'notas_imagens'::text, registros_count, 'limpo'::text;
    
    -- 8. Limpar notas
    DELETE FROM notas WHERE user_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'notas'::text, registros_count, 'limpo'::text;
    
    -- 9. Limpar estoque_app
    DELETE FROM estoque_app WHERE user_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'estoque_app'::text, registros_count, 'limpo'::text;
    
    -- 10. Limpar precos_atuais_usuario
    DELETE FROM precos_atuais_usuario WHERE user_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'precos_atuais_usuario'::text, registros_count, 'limpo'::text;
    
    -- 11. Limpar produtos
    DELETE FROM produtos WHERE user_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'produtos'::text, registros_count, 'limpo'::text;
    
    -- 12. Limpar mercados
    DELETE FROM mercados WHERE user_id = target_user_id;
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'mercados'::text, registros_count, 'limpo'::text;
    
    -- 13. Limpar categorias (se tiver user_id)
    DELETE FROM categorias WHERE EXISTS (
        SELECT 1 FROM estoque_app WHERE user_id = target_user_id AND categoria = categorias.nome
    );
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'categorias'::text, registros_count, 'limpo'::text;
    
    -- 14. Limpar ingestion_jobs relacionados
    DELETE FROM ingestion_jobs WHERE payload::text LIKE '%' || target_user_id::text || '%';
    GET DIAGNOSTICS registros_count = ROW_COUNT;
    RETURN QUERY SELECT 'ingestion_jobs'::text, registros_count, 'limpo'::text;
    
    RETURN;
END;
$$;