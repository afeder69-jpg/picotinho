-- Identificar e corrigir views com SECURITY DEFINER
-- Primeiro, vamos verificar se há views com SECURITY DEFINER no sistema

-- Dropar e recriar a view supermercados_publicos sem SECURITY DEFINER
DROP VIEW IF EXISTS public.supermercados_publicos;

-- Criar a view novamente sem SECURITY DEFINER
CREATE VIEW public.supermercados_publicos AS
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
    'CONFIDENTIAL' AS cnpj_display  -- Não expor CNPJ diretamente
FROM public.supermercados s
WHERE s.ativo = true;

-- Habilitar RLS na view
ALTER VIEW public.supermercados_publicos SET (security_invoker = true);

-- Criar uma política para permitir acesso público de leitura aos supermercados ativos
-- Como é uma view, precisamos usar uma política que permita acesso público
CREATE POLICY "Allow public read access to active supermarkets"
ON public.supermercados_publicos
FOR SELECT
USING (ativo = true);

-- Comentário explicativo
COMMENT ON VIEW public.supermercados_publicos IS 'View pública dos supermercados sem dados sensíveis como CNPJ, telefone e email. Usa security_invoker para aplicar RLS do usuário.';

-- Verificar se existem outras views ou funções com SECURITY DEFINER que precisam ser corrigidas
-- (Esta query será executada para logging/debug apenas)
DO $$
DECLARE
    view_record RECORD;
BEGIN
    -- Log views que ainda podem ter problemas de security definer
    FOR view_record IN 
        SELECT schemaname, viewname, definition 
        FROM pg_views 
        WHERE schemaname = 'public'
        AND definition ILIKE '%SECURITY DEFINER%'
    LOOP
        RAISE NOTICE 'View com possível SECURITY DEFINER: %.%', view_record.schemaname, view_record.viewname;
    END LOOP;
    
    RAISE NOTICE 'Verificação de views SECURITY DEFINER concluída.';
END $$;