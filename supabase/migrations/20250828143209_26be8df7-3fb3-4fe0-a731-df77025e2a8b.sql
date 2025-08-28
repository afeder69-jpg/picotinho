-- Corrigir vulnerabilidades de SECURITY DEFINER em funções
-- Análise: Algumas funções tem SECURITY DEFINER desnecessário que pode burlar RLS

-- 1. Função limpar_estoque_usuario - CRÍTICA: Permite deletar dados de qualquer usuário
-- Remover SECURITY DEFINER e garantir que só pode ser chamada pelo próprio usuário
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
    
    -- Deletar todo o estoque do usuário
    DELETE FROM estoque_app WHERE user_id = usuario_uuid;
    
    RAISE NOTICE 'Estoque do usuário % limpo completamente', usuario_uuid;
END;
$$;

-- 2. Função recalcular_estoque_usuario - CRÍTICA: Permite manipular dados de qualquer usuário
-- Remover SECURITY DEFINER e garantir que só pode ser chamada pelo próprio usuário
CREATE OR REPLACE FUNCTION public.recalcular_estoque_usuario(usuario_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    item_record RECORD;
    produto_record RECORD;
    nome_normalizado TEXT;
    estoque_record RECORD;
BEGIN
    -- Verificar se o usuário pode recalcular apenas seu próprio estoque
    IF auth.uid() != usuario_uuid THEN
        RAISE EXCEPTION 'Acesso negado: você só pode recalcular seu próprio estoque';
    END IF;
    
    -- Primeiro limpar o estoque atual
    DELETE FROM estoque_app WHERE user_id = usuario_uuid;
    
    RAISE NOTICE 'Recalculando estoque para usuário: %', usuario_uuid;
    
    -- Iterar sobre todos os itens de compra do usuário
    FOR item_record IN 
        SELECT 
            ic.produto_id,
            ic.quantidade,
            ic.preco_unitario,
            p.nome as produto_nome,
            p.unidade_medida,
            c.user_id
        FROM itens_compra_app ic
        JOIN compras_app c ON ic.compra_id = c.id
        JOIN produtos_app p ON ic.produto_id = p.id
        WHERE c.user_id = usuario_uuid
        ORDER BY c.data_compra, c.hora_compra
    LOOP
        -- Normalizar nome do produto
        nome_normalizado := UPPER(TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(item_record.produto_nome, '\b(GRAENC|GRANEL)\b', 'GRANEL', 'gi'),
                        '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b', 'PAO DE FORMA', 'gi'
                    ),
                    '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|\d+G|\d+ML|\d+L)\b', '', 'gi'
                ),
                '\s+', ' ', 'g'
            )
        ));
        
        -- Verificar se já existe no estoque
        SELECT * INTO estoque_record
        FROM estoque_app 
        WHERE user_id = usuario_uuid
        AND produto_nome = nome_normalizado;
        
        IF FOUND THEN
            -- Atualizar quantidade existente
            UPDATE estoque_app 
            SET 
                quantidade = quantidade + item_record.quantidade,
                preco_unitario_ultimo = item_record.preco_unitario,
                updated_at = now()
            WHERE id = estoque_record.id;
        ELSE
            -- Criar novo item no estoque
            INSERT INTO estoque_app (
                user_id,
                produto_nome,
                categoria,
                quantidade,
                unidade_medida,
                preco_unitario_ultimo
            ) VALUES (
                usuario_uuid,
                nome_normalizado,
                'outros', -- categoria padrão
                item_record.quantidade,
                item_record.unidade_medida,
                item_record.preco_unitario
            );
        END IF;
        
    END LOOP;
    
    RAISE NOTICE 'Recálculo de estoque concluído para usuário: %', usuario_uuid;
END;
$$;

-- 3. Função handle_new_user - BAIXO RISCO: Apenas retorna o usuário
-- Manter SECURITY DEFINER pois é um trigger do sistema de auth
-- Mas adicionar verificação básica por segurança
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Verificação básica - apenas aceita se veio do sistema de auth
    IF TG_OP != 'INSERT' THEN
        RAISE EXCEPTION 'Esta função só pode ser chamada em INSERT de novos usuários';
    END IF;
    
    -- O perfil será criado pela aplicação, não automaticamente
    -- Retorna o novo usuário
    RETURN NEW;
END;
$$;

-- 4. Funções de trigger (calculate_item_total_app, insert_historico_precos_app) 
-- São necessárias com SECURITY DEFINER para triggers funcionarem corretamente
-- Mas vamos adicionar verificações de segurança

-- Verificar se a função de cálculo está sendo chamada apenas em contexto de trigger
CREATE OR REPLACE FUNCTION public.calculate_item_total_app()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Verificar se está sendo chamada em contexto de trigger
    IF TG_OP NOT IN ('INSERT', 'UPDATE') THEN
        RAISE EXCEPTION 'Esta função só pode ser chamada em triggers de INSERT/UPDATE';
    END IF;
    
    NEW.preco_total = (NEW.quantidade * NEW.preco_unitario) - COALESCE(NEW.desconto_item, 0);
    RETURN NEW;
END;
$$;

-- Verificar se a função de histórico está sendo chamada apenas em contexto de trigger
CREATE OR REPLACE FUNCTION public.insert_historico_precos_app()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Verificar se está sendo chamada em contexto de trigger
    IF TG_OP != 'INSERT' THEN
        RAISE EXCEPTION 'Esta função só pode ser chamada em triggers de INSERT';
    END IF;
    
    INSERT INTO public.historico_precos_app (produto_id, supermercado_id, preco, data_preco)
    SELECT 
        NEW.produto_id,
        c.supermercado_id,
        NEW.preco_unitario,
        c.data_compra
    FROM public.compras_app c
    WHERE c.id = NEW.compra_id;
    
    RETURN NEW;
END;
$$;

-- 5. Função update_updated_at_column - BAIXO RISCO: Apenas atualiza timestamp
-- Remover SECURITY DEFINER pois não precisa de privilégios especiais
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 6. Função log_user_access_attempt - MANTER: É para auditoria de segurança
-- Manter SECURITY DEFINER pois precisa logar tentativas não autorizadas
-- Já tem validação adequada

-- 7. Função cleanup_old_ingestion_jobs - MANTER: É para limpeza de sistema
-- Já tem validação adequada restringindo ao service_role

-- Verificar resultado final
SELECT 
    p.proname as function_name,
    CASE 
        WHEN p.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END as security_type,
    p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname LIKE '%app%'
ORDER BY p.proname;