-- Habilitar RLS nas novas tabelas
ALTER TABLE public.sinonimos_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalizacoes_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas_revisao ENABLE ROW LEVEL SECURITY;

-- Políticas para sinonimos_produtos
DROP POLICY IF EXISTS "Todos podem ler sinônimos" ON public.sinonimos_produtos;
CREATE POLICY "Todos podem ler sinônimos" ON public.sinonimos_produtos 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Sistema pode inserir sinônimos" ON public.sinonimos_produtos;
CREATE POLICY "Sistema pode inserir sinônimos" ON public.sinonimos_produtos 
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Sistema pode atualizar sinônimos" ON public.sinonimos_produtos;
CREATE POLICY "Sistema pode atualizar sinônimos" ON public.sinonimos_produtos 
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Sistema pode deletar sinônimos" ON public.sinonimos_produtos;
CREATE POLICY "Sistema pode deletar sinônimos" ON public.sinonimos_produtos 
    FOR DELETE USING (true);

-- Políticas para normalizacoes_log
DROP POLICY IF EXISTS "Sistema pode inserir logs" ON public.normalizacoes_log;
CREATE POLICY "Sistema pode inserir logs" ON public.normalizacoes_log 
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Sistema pode ler logs" ON public.normalizacoes_log;
CREATE POLICY "Sistema pode ler logs" ON public.normalizacoes_log 
    FOR SELECT USING (true);

-- Políticas para propostas_revisao
DROP POLICY IF EXISTS "Usuários podem ver propostas" ON public.propostas_revisao;
CREATE POLICY "Usuários podem ver propostas" ON public.propostas_revisao 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Usuários podem atualizar propostas" ON public.propostas_revisao;
CREATE POLICY "Usuários podem atualizar propostas" ON public.propostas_revisao 
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Sistema pode criar propostas" ON public.propostas_revisao;
CREATE POLICY "Sistema pode criar propostas" ON public.propostas_revisao 
    FOR INSERT WITH CHECK (true);

-- Habilitar RLS e criar políticas para produtos_normalizados se não tiver
DO $$
BEGIN
    -- Habilitar RLS na tabela produtos_normalizados
    IF NOT EXISTS (
        SELECT 1 FROM pg_class 
        WHERE relname = 'produtos_normalizados' 
        AND relrowsecurity = true
    ) THEN
        ALTER TABLE public.produtos_normalizados ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Políticas para produtos_normalizados
DROP POLICY IF EXISTS "Todos podem ler produtos normalizados" ON public.produtos_normalizados;
CREATE POLICY "Todos podem ler produtos normalizados" ON public.produtos_normalizados 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Sistema pode inserir produtos normalizados" ON public.produtos_normalizados;
CREATE POLICY "Sistema pode inserir produtos normalizados" ON public.produtos_normalizados 
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Sistema pode atualizar produtos normalizados" ON public.produtos_normalizados;
CREATE POLICY "Sistema pode atualizar produtos normalizados" ON public.produtos_normalizados 
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Sistema pode deletar produtos normalizados" ON public.produtos_normalizados;
CREATE POLICY "Sistema pode deletar produtos normalizados" ON public.produtos_normalizados 
    FOR DELETE USING (true);