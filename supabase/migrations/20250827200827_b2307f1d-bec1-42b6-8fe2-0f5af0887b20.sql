-- Função para recalcular estoque baseado apenas nas notas existentes
CREATE OR REPLACE FUNCTION recalcular_estoque_completo()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    -- Limpar todo o estoque atual
    DELETE FROM estoque_app;
    
    RAISE NOTICE 'Estoque limpo. Recalculando baseado nas notas existentes...';
    
    -- Reprocessar todas as notas processadas que ainda existem
    -- Isso irá recriar o estoque corretamente
    PERFORM * FROM notas_imagens WHERE processada = true;
    
    RAISE NOTICE 'Recálculo de estoque concluído!';
END;
$$;

-- Executar a função para limpar e recalcular o estoque
SELECT recalcular_estoque_completo();