-- Corrigir função limpar_estoque_usuario para respeitar a Regra de Ouro do Picotinho
-- A função deve zerar quantidades mas preservar histórico de preços, datas e supermercados

CREATE OR REPLACE FUNCTION public.limpar_estoque_usuario(usuario_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    -- Verificar se o usuário pode limpar apenas seu próprio estoque
    IF auth.uid() != usuario_uuid THEN
        RAISE EXCEPTION 'Acesso negado: você só pode limpar seu próprio estoque';
    END IF;
    
    -- ⚠️ REGRA DE OURO: Nunca deletar histórico!
    -- Em vez de DELETE, apenas zerar quantidades preservando preços, datas e supermercados
    UPDATE estoque_app 
    SET 
        quantidade = 0,
        updated_at = now()
    WHERE user_id = usuario_uuid;
    
    RAISE NOTICE 'Quantidades do estoque zeradas para usuário % (histórico preservado)', usuario_uuid;
END;
$$;