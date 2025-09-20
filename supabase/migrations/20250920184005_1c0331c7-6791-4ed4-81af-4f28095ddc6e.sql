-- Função para limpar produtos com dados inconsistentes
CREATE OR REPLACE FUNCTION limpar_produtos_inconsistentes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    usuario_id uuid;
BEGIN
    -- Obter o ID do usuário autenticado
    SELECT auth.uid() INTO usuario_id;
    
    IF usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;
    
    -- Remover produtos com quantidade zero ou nula
    DELETE FROM estoque_app 
    WHERE user_id = usuario_id 
    AND (quantidade IS NULL OR quantidade = 0);
    
    -- Marcar todas as notas como não processadas para reprocessamento
    UPDATE notas_imagens 
    SET processada = false, updated_at = now()
    WHERE usuario_id = usuario_id;
    
    RAISE NOTICE 'Produtos inconsistentes removidos e notas marcadas para reprocessamento';
END;
$$;