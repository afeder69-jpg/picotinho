-- Corrigir Security Definer View definitivamente
-- Views em PostgreSQL herdam RLS das tabelas base, não precisam de políticas próprias

-- Dropar a view problemática
DROP VIEW IF EXISTS public.supermercados_publicos CASCADE;

-- Recriar a view sem SECURITY DEFINER e com security_invoker explícito
CREATE VIEW public.supermercados_publicos 
WITH (security_invoker = true) AS
SELECT 
    s.id,
    s.nome,
    s.endereco,
    s.cidade,
    s.estado,
    s.cep,
    s.latitude,
    s.longitude,
    s.ativo,
    s.created_at,
    s.updated_at,
    'CONFIDENTIAL' AS cnpj_display  -- Campo mascarado para não expor CNPJ
FROM public.supermercados s
WHERE s.ativo = true;

-- Adicionar comentário de segurança
COMMENT ON VIEW public.supermercados_publicos IS 
'View segura dos supermercados ativos. Configurada com security_invoker=true para executar com permissões do usuário consultante, não do criador. Campo CNPJ mascarado para proteger dados sensíveis.';

-- Verificar outras funções que podem ter SECURITY DEFINER desnecessário
DO $$
DECLARE
    func_record RECORD;
    view_record RECORD;
    definer_count INTEGER := 0;
BEGIN
    -- Verificar funções com SECURITY DEFINER que podem ser problemáticas
    FOR func_record IN 
        SELECT routine_name, routine_type, security_type
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND security_type = 'DEFINER'
        AND routine_name NOT IN (
            'handle_new_user_config', 'validate_user_access', 'get_user_email',
            'update_compra_total_app', 'get_my_profile_safe', 'handle_new_user',
            'get_supermercados_basicos', 'prevent_email_updates', 'consolidar_estoque_duplicado',
            'protect_user_email', 'reverter_estoque_nota_excluida', 'recalcular_estoque_completo',
            'corrigir_produtos_manuais_sem_preco', 'limpar_estoque_usuario', 'recalcular_estoque_usuario',
            'diagnosticar_e_corrigir_estoque', 'log_user_access_attempt', 'log_profile_access',
            'cleanup_old_ingestion_jobs', 'calculate_item_total_app', 'insert_historico_precos_app',
            'secure_profile_access', 'get_profile_safe', 'get_my_profile', 'mask_phone_number',
            'update_my_profile', 'validate_security_setup', 'get_profile_summary',
            'update_updated_at_whatsapp'
        )  -- Funções legítimas que precisam de SECURITY DEFINER
    LOOP
        definer_count := definer_count + 1;
        RAISE NOTICE 'ATENÇÃO: Função % (%) tem SECURITY DEFINER', func_record.routine_name, func_record.routine_type;
    END LOOP;
    
    -- Verificar views problemáticas
    FOR view_record IN 
        SELECT schemaname, viewname 
        FROM pg_views 
        WHERE schemaname = 'public'
        AND definition ILIKE '%SECURITY DEFINER%'
    LOOP
        definer_count := definer_count + 1;
        RAISE NOTICE 'ATENÇÃO: View %.% ainda contém SECURITY DEFINER na definição', view_record.schemaname, view_record.viewname;
    END LOOP;
    
    IF definer_count = 0 THEN
        RAISE NOTICE 'SUCESSO: Nenhuma view ou função problemática com SECURITY DEFINER encontrada.';
    END IF;
    
    RAISE NOTICE 'View supermercados_publicos corrigida com security_invoker = true';
END $$;