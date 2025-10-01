-- Garantir que a.feder69@gmail.com seja master inicial
-- Esta é uma operação idempotente (pode rodar múltiplas vezes sem problemas)

DO $$
DECLARE
    usuario_master_id UUID;
BEGIN
    -- Buscar o ID do usuário com email a.feder69@gmail.com
    SELECT id INTO usuario_master_id
    FROM auth.users
    WHERE email = 'a.feder69@gmail.com'
    LIMIT 1;
    
    -- Se o usuário existe, garantir que seja master
    IF usuario_master_id IS NOT NULL THEN
        -- Inserir role master (se não existir)
        INSERT INTO public.user_roles (user_id, role)
        VALUES (usuario_master_id, 'master')
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE 'Usuário master configurado: a.feder69@gmail.com (ID: %)', usuario_master_id;
    ELSE
        RAISE WARNING 'Usuário a.feder69@gmail.com não encontrado - role master será atribuída quando o usuário for criado';
    END IF;
END $$;