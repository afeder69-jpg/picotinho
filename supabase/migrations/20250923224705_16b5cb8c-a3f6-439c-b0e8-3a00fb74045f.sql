-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Complementar tabela produtos_normalizados existente
ALTER TABLE public.produtos_normalizados 
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS nome_normalizado TEXT,
ADD COLUMN IF NOT EXISTS marca TEXT,
ADD COLUMN IF NOT EXISTS variante TEXT,
ADD COLUMN IF NOT EXISTS descricao TEXT,
ADD COLUMN IF NOT EXISTS embedding vector(384),
ADD COLUMN IF NOT EXISTS provisorio BOOLEAN DEFAULT false;

-- Copiar nome_padrao para nome_normalizado se necessário
UPDATE public.produtos_normalizados 
SET nome_normalizado = nome_padrao 
WHERE nome_normalizado IS NULL AND nome_padrao IS NOT NULL;

-- Gerar SKUs únicos para produtos existentes que não têm
UPDATE public.produtos_normalizados 
SET sku = 'SKU-' || UPPER(substring(md5(COALESCE(nome_padrao, nome_normalizado) || categoria || id::text), 1, 8))
WHERE sku IS NULL;

-- Adicionar constraint único para SKU
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_normalizados_sku_key') THEN
        ALTER TABLE public.produtos_normalizados ADD CONSTRAINT produtos_normalizados_sku_key UNIQUE (sku);
    END IF;
END $$;

-- Tabela de sinônimos (histórico de correspondências)
CREATE TABLE IF NOT EXISTS public.sinonimos_produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id UUID REFERENCES public.produtos_normalizados(id) ON DELETE CASCADE,
    texto_origem TEXT NOT NULL,
    fonte TEXT,
    confianca NUMERIC(3,2),
    aprovado_por UUID,
    metodo_criacao TEXT DEFAULT 'automatico',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de log de normalizações (auditoria completa)
CREATE TABLE IF NOT EXISTS public.normalizacoes_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    texto_origem TEXT NOT NULL,
    produto_id UUID REFERENCES public.produtos_normalizados(id),
    acao TEXT NOT NULL,
    score_embedding NUMERIC(4,3),
    score_fuzzy NUMERIC(4,3),
    score_agregado NUMERIC(4,3),
    candidatos JSONB,
    metadata JSONB,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de propostas pendentes de revisão
CREATE TABLE IF NOT EXISTS public.propostas_revisao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    texto_origem TEXT NOT NULL,
    fonte TEXT,
    candidatos JSONB NOT NULL,
    score_melhor NUMERIC(4,3),
    status TEXT DEFAULT 'pendente',
    produto_escolhido_id UUID REFERENCES public.produtos_normalizados(id),
    novo_produto JSONB,
    aprovado_por UUID,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_produtos_normalizados_nome ON public.produtos_normalizados USING gin(COALESCE(nome_normalizado, nome_padrao) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_produtos_normalizados_sku ON public.produtos_normalizados(sku);
CREATE INDEX IF NOT EXISTS idx_produtos_normalizados_categoria ON public.produtos_normalizados(categoria);
CREATE INDEX IF NOT EXISTS idx_produtos_normalizados_embedding ON public.produtos_normalizados USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_sinonimos_produtos_produto_id ON public.sinonimos_produtos(produto_id);
CREATE INDEX IF NOT EXISTS idx_sinonimos_produtos_texto ON public.sinonimos_produtos USING gin(texto_origem gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sinonimos_produtos_fonte ON public.sinonimos_produtos(fonte);

CREATE INDEX IF NOT EXISTS idx_normalizacoes_log_texto ON public.normalizacoes_log(texto_origem);
CREATE INDEX IF NOT EXISTS idx_normalizacoes_log_produto_id ON public.normalizacoes_log(produto_id);
CREATE INDEX IF NOT EXISTS idx_normalizacoes_log_created_at ON public.normalizacoes_log(created_at);

CREATE INDEX IF NOT EXISTS idx_propostas_revisao_status ON public.propostas_revisao(status);
CREATE INDEX IF NOT EXISTS idx_propostas_revisao_score ON public.propostas_revisao(score_melhor DESC);

-- Trigger para updated_at em propostas_revisao
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_propostas_revisao_updated_at ON public.propostas_revisao;
CREATE TRIGGER update_propostas_revisao_updated_at
    BEFORE UPDATE ON public.propostas_revisao
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();