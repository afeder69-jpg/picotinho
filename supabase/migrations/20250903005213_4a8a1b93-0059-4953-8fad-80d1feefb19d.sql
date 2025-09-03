-- Corrigir problema de Security Definer View
-- Dropar e recriar a view supermercados_publicos sem SECURITY DEFINER

-- Primeiro verificar se é uma view e dropa-la corretamente
DROP VIEW IF EXISTS public.supermercados_publicos CASCADE;

-- Recriar a view sem SECURITY DEFINER (usa security_invoker por padrão)
CREATE OR REPLACE VIEW public.supermercados_publicos 
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
    'CONFIDENTIAL' AS cnpj_display  -- Não expor CNPJ real
FROM public.supermercados s
WHERE s.ativo = true;

-- Habilitar RLS na view (views herdam RLS da tabela base)
ALTER VIEW public.supermercados_publicos ENABLE ROW LEVEL SECURITY;

-- Criar política para permitir acesso público de leitura
CREATE POLICY "public_supermarkets_read_policy"
ON public.supermercados_publicos
FOR SELECT
TO PUBLIC
USING (ativo = true);

-- Adicionar comentário explicativo
COMMENT ON VIEW public.supermercados_publicos IS 
'View pública segura dos supermercados ativos sem dados sensíveis. Usa security_invoker para aplicar permissões do usuário consultante ao invés do criador da view.';

-- Log para verificação
DO $$
BEGIN
    RAISE NOTICE 'View supermercados_publicos recriada sem SECURITY DEFINER';
    RAISE NOTICE 'Configurada com security_invoker = true para maior segurança';
END $$;