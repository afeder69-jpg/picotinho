-- Função para limpar completamente o estoque do usuário
CREATE OR REPLACE FUNCTION public.limpar_estoque_completo_usuario()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    usuario_id uuid;
    total_deletado integer;
BEGIN
    -- Obter o ID do usuário autenticado
    SELECT auth.uid() INTO usuario_id;
    
    IF usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;
    
    -- Deletar TODOS os itens do estoque do usuário
    DELETE FROM estoque_app WHERE user_id = usuario_id;
    
    GET DIAGNOSTICS total_deletado = ROW_COUNT;
    
    RAISE NOTICE 'Estoque completamente limpo para usuário %: % itens deletados', usuario_id, total_deletado;
END;
$function$;