-- =====================================================
-- SISTEMA DE NORMALIZAÇÃO GLOBAL - PICOTINHO
-- =====================================================
-- Sistema paralelo para normalização universal de produtos
-- Master inicial: a.feder69@gmail.com
-- Zero impacto no sistema atual

-- =====================================================
-- 1. CATÁLOGO MASTER GLOBAL
-- =====================================================
CREATE TABLE IF NOT EXISTS public.produtos_master_global (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificação Universal
    sku_global TEXT UNIQUE NOT NULL, -- SKU único universal
    nome_padrao TEXT NOT NULL, -- Nome normalizado oficial
    categoria TEXT NOT NULL,
    
    -- Estrutura do Produto
    nome_base TEXT NOT NULL, -- Ex: "Arroz"
    marca TEXT, -- Ex: "Tio João"
    tipo_embalagem TEXT, -- Ex: "Pacote", "Saco"
    
    -- Quantidade Normalizada
    qtd_valor NUMERIC, -- Ex: 5
    qtd_unidade TEXT, -- Ex: "kg", "L", "ml"
    qtd_base NUMERIC, -- Valor base para comparação (sempre em unidade padrão)
    granel BOOLEAN DEFAULT false,
    
    -- Metadados
    total_usuarios INTEGER DEFAULT 0, -- Quantos usuários têm este produto
    total_notas INTEGER DEFAULT 0, -- Em quantas notas aparece
    confianca_normalizacao NUMERIC DEFAULT 0, -- Score de confiança (0-100)
    
    -- Status e Aprovação
    status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'revisao')),
    aprovado_por UUID REFERENCES auth.users(id),
    aprovado_em TIMESTAMP WITH TIME ZONE,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_produtos_master_categoria ON public.produtos_master_global(categoria);
CREATE INDEX IF NOT EXISTS idx_produtos_master_nome_base ON public.produtos_master_global(nome_base);
CREATE INDEX IF NOT EXISTS idx_produtos_master_marca ON public.produtos_master_global(marca);
CREATE INDEX IF NOT EXISTS idx_produtos_master_status ON public.produtos_master_global(status);

-- =====================================================
-- 2. FILA DE CANDIDATOS PARA NORMALIZAÇÃO
-- =====================================================
CREATE TABLE IF NOT EXISTS public.produtos_candidatos_normalizacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Origem
    texto_original TEXT NOT NULL, -- Nome original do produto na nota
    usuario_id UUID REFERENCES auth.users(id),
    nota_imagem_id UUID REFERENCES public.notas_imagens(id),
    
    -- Análise da IA
    sugestao_sku_global TEXT, -- SKU sugerido pela IA
    sugestao_produto_master UUID REFERENCES public.produtos_master_global(id), -- Produto master sugerido
    confianca_ia NUMERIC, -- Score de confiança da IA (0-100)
    
    -- Proposta de Normalização
    nome_padrao_sugerido TEXT,
    categoria_sugerida TEXT,
    nome_base_sugerido TEXT,
    marca_sugerida TEXT,
    tipo_embalagem_sugerido TEXT,
    qtd_valor_sugerido NUMERIC,
    qtd_unidade_sugerido TEXT,
    granel_sugerido BOOLEAN,
    
    -- Metadata da Análise
    candidatos_similares JSONB, -- Array de produtos similares encontrados
    razao_ia TEXT, -- Explicação da IA sobre a sugestão
    
    -- Status de Aprovação
    status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'auto_aprovado')),
    revisado_por UUID REFERENCES auth.users(id),
    revisado_em TIMESTAMP WITH TIME ZONE,
    observacoes_revisor TEXT,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_candidatos_status ON public.produtos_candidatos_normalizacao(status);
CREATE INDEX IF NOT EXISTS idx_candidatos_confianca ON public.produtos_candidatos_normalizacao(confianca_ia DESC);
CREATE INDEX IF NOT EXISTS idx_candidatos_usuario ON public.produtos_candidatos_normalizacao(usuario_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_nota ON public.produtos_candidatos_normalizacao(nota_imagem_id);

-- =====================================================
-- 3. SISTEMA DE SINÔNIMOS GLOBAIS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.produtos_sinonimos_globais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relacionamento
    produto_master_id UUID NOT NULL REFERENCES public.produtos_master_global(id) ON DELETE CASCADE,
    texto_variacao TEXT NOT NULL, -- Variação do nome (ex: "Arroz TJ 5kg")
    
    -- Metadata
    fonte TEXT, -- 'ia', 'master', 'automatico'
    confianca NUMERIC DEFAULT 100, -- Confiança desta associação
    total_ocorrencias INTEGER DEFAULT 1, -- Quantas vezes vimos esta variação
    
    -- Aprovação
    aprovado_por UUID REFERENCES auth.users(id),
    aprovado_em TIMESTAMP WITH TIME ZONE,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    UNIQUE(produto_master_id, texto_variacao)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sinonimos_master ON public.produtos_sinonimos_globais(produto_master_id);
CREATE INDEX IF NOT EXISTS idx_sinonimos_texto ON public.produtos_sinonimos_globais(texto_variacao);

-- =====================================================
-- 4. LOG DE DECISÕES PARA APRENDIZADO
-- =====================================================
CREATE TABLE IF NOT EXISTS public.normalizacao_decisoes_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Contexto
    candidato_id UUID REFERENCES public.produtos_candidatos_normalizacao(id),
    texto_original TEXT NOT NULL,
    
    -- Decisão
    decisao TEXT NOT NULL CHECK (decisao IN ('aprovado', 'rejeitado', 'modificado')),
    decidido_por UUID REFERENCES auth.users(id),
    produto_master_final UUID REFERENCES public.produtos_master_global(id),
    
    -- Detalhes
    sugestao_ia JSONB, -- O que a IA sugeriu
    decisao_master JSONB, -- O que o master decidiu
    feedback_texto TEXT, -- Feedback do master
    
    -- Aprendizado
    usado_para_treino BOOLEAN DEFAULT false,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_decisoes_decidido_por ON public.normalizacao_decisoes_log(decidido_por);
CREATE INDEX IF NOT EXISTS idx_decisoes_produto_master ON public.normalizacao_decisoes_log(produto_master_final);
CREATE INDEX IF NOT EXISTS idx_decisoes_treino ON public.normalizacao_decisoes_log(usado_para_treino);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.produtos_master_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_candidatos_normalizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_sinonimos_globais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalizacao_decisoes_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLÍTICAS RLS - APENAS MASTERS TÊM ACESSO
-- =====================================================

-- Produtos Master Global
CREATE POLICY "Masters podem ver todos os produtos master"
ON public.produtos_master_global FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Masters podem inserir produtos master"
ON public.produtos_master_global FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Masters podem atualizar produtos master"
ON public.produtos_master_global FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Masters podem deletar produtos master"
ON public.produtos_master_global FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- Candidatos para Normalização
CREATE POLICY "Masters podem ver candidatos"
ON public.produtos_candidatos_normalizacao FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Sistema pode inserir candidatos"
ON public.produtos_candidatos_normalizacao FOR INSERT
TO authenticated
WITH CHECK (true); -- Edge function precisa inserir

CREATE POLICY "Masters podem atualizar candidatos"
ON public.produtos_candidatos_normalizacao FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- Sinônimos Globais
CREATE POLICY "Masters podem ver sinônimos"
ON public.produtos_sinonimos_globais FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Masters podem inserir sinônimos"
ON public.produtos_sinonimos_globais FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Masters podem atualizar sinônimos"
ON public.produtos_sinonimos_globais FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Masters podem deletar sinônimos"
ON public.produtos_sinonimos_globais FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- Log de Decisões
CREATE POLICY "Masters podem ver log de decisões"
ON public.normalizacao_decisoes_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Sistema pode inserir no log"
ON public.normalizacao_decisoes_log FOR INSERT
TO authenticated
WITH CHECK (true); -- Edge function precisa inserir

-- =====================================================
-- FUNÇÕES AUXILIARES
-- =====================================================

-- Função para auto-atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_normalizacao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_produtos_master_global_updated_at
    BEFORE UPDATE ON public.produtos_master_global
    FOR EACH ROW
    EXECUTE FUNCTION public.update_normalizacao_updated_at();

CREATE TRIGGER update_candidatos_normalizacao_updated_at
    BEFORE UPDATE ON public.produtos_candidatos_normalizacao
    FOR EACH ROW
    EXECUTE FUNCTION public.update_normalizacao_updated_at();

-- =====================================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- =====================================================
COMMENT ON TABLE public.produtos_master_global IS 'Catálogo universal de produtos normalizados - apenas masters têm acesso';
COMMENT ON TABLE public.produtos_candidatos_normalizacao IS 'Fila de produtos aguardando aprovação do master para normalização';
COMMENT ON TABLE public.produtos_sinonimos_globais IS 'Mapeamento de variações de nomes para produtos master';
COMMENT ON TABLE public.normalizacao_decisoes_log IS 'Histórico de decisões dos masters para aprendizado da IA';