-- Função para limpeza completa dos dados do usuário autenticado
CREATE OR REPLACE FUNCTION public.limpar_dados_usuario_completo()
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
    
    RAISE NOTICE '🧹 Iniciando limpeza completa para usuário: %', usuario_id;
    
    -- 1. Limpar estoque
    DELETE FROM estoque_app WHERE user_id = usuario_id;
    RAISE NOTICE '✅ Estoque limpo';
    
    -- 2. Limpar notas de imagens
    DELETE FROM notas_imagens WHERE usuario_id = usuario_id;
    RAISE NOTICE '✅ Notas de imagens limpas';
    
    -- 3. Limpar preços atuais do usuário
    DELETE FROM precos_atuais_usuario WHERE user_id = usuario_id;
    RAISE NOTICE '✅ Preços atuais do usuário limpos';
    
    -- 4. Limpar outras tabelas relacionadas
    DELETE FROM notas WHERE user_id = usuario_id;
    DELETE FROM notas_fiscais WHERE user_id = usuario_id;
    DELETE FROM receipts WHERE user_id = usuario_id;
    
    RAISE NOTICE '✅ Limpeza completa concluída para usuário: %', usuario_id;
END;
$$;