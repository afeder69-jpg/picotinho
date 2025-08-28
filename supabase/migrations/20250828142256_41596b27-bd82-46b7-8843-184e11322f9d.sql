-- Corrigir vulnerabilidade de exposição de operações internas na tabela ingestion_jobs
-- Atualmente permite acesso irrestrito a dados sensíveis do sistema

-- Verificar estado atual das políticas
SELECT 
    policyname, 
    cmd, 
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'ingestion_jobs' AND schemaname = 'public';

-- Verificar estrutura da tabela para entender os dados sensíveis
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'ingestion_jobs' 
AND table_schema = 'public';

-- Remover política muito permissiva atual
DROP POLICY IF EXISTS "Allow system access" ON public.ingestion_jobs;

-- Garantir que RLS está habilitado
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

-- Bloquear completamente acesso direto de usuários - apenas sistema interno
CREATE POLICY "Bloquear acesso direto de usuários ao sistema de jobs" 
ON public.ingestion_jobs 
FOR SELECT 
USING (false);

-- Permitir INSERT apenas para operações do sistema (edge functions, triggers)
-- Usando uma função que verifica se é uma operação do sistema
CREATE POLICY "Sistema pode criar jobs de processamento" 
ON public.ingestion_jobs 
FOR INSERT 
WITH CHECK (
    -- Permite INSERT apenas se não há usuário autenticado (operação do sistema)
    -- ou se é uma operação de edge function
    auth.uid() IS NULL OR 
    current_setting('role', true) = 'service_role'
);

-- Permitir UPDATE apenas para operações do sistema
CREATE POLICY "Sistema pode atualizar status dos jobs" 
ON public.ingestion_jobs 
FOR UPDATE 
USING (
    auth.uid() IS NULL OR 
    current_setting('role', true) = 'service_role'
);

-- Bloquear DELETE direto - dados de auditoria devem ser preservados
CREATE POLICY "Bloquear exclusão direta de jobs" 
ON public.ingestion_jobs 
FOR DELETE 
USING (false);

-- Criar função para limpeza periódica de jobs antigos (apenas para admins)
CREATE OR REPLACE FUNCTION public.cleanup_old_ingestion_jobs(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Apenas service_role pode executar limpeza
    IF current_setting('role', true) != 'service_role' THEN
        RAISE EXCEPTION 'Acesso negado: apenas operações de sistema podem limpar jobs';
    END IF;
    
    DELETE FROM public.ingestion_jobs 
    WHERE created_at < (now() - (days_old || ' days')::interval)
    AND state IN ('completed', 'failed');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE LOG 'Limpeza de jobs: % registros removidos (mais de % dias)', deleted_count, days_old;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Verificar resultado final
SELECT 
    policyname, 
    cmd, 
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'ingestion_jobs' AND schemaname = 'public'
ORDER BY cmd;