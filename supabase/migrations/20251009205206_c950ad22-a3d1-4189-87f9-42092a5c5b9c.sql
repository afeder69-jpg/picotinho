-- ============================================================
-- FASE 1: SISTEMA DE PONTOS MODULAR E ESCALÁVEL
-- ============================================================

-- Enum para roles (se não existir)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'master');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabela central de pontos do usuário (consolidado e modular)
CREATE TABLE IF NOT EXISTS public.usuarios_pontos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  pontos_disponiveis INTEGER DEFAULT 0 CHECK (pontos_disponiveis >= 0),
  pontos_resgatados INTEGER DEFAULT 0 CHECK (pontos_resgatados >= 0),
  pontos_totais_ganhos INTEGER DEFAULT 0 CHECK (pontos_totais_ganhos >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de histórico/log de pontos (universal para todas as categorias)
CREATE TABLE IF NOT EXISTS public.usuarios_pontos_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL, -- 'receitas', 'notas_fiscais', 'estoque', 'supermercados', etc
  tipo_evento TEXT NOT NULL, -- Evento específico dentro da categoria
  pontos_ganhos INTEGER DEFAULT 0,
  pontos_gastos INTEGER DEFAULT 0,
  descricao TEXT,
  metadata JSONB, -- Dados extras específicos do evento
  -- Referências opcionais para diferentes entidades
  receita_id UUID REFERENCES public.receitas(id) ON DELETE SET NULL,
  avaliacao_id UUID,
  nota_id UUID,
  produto_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de regras de pontuação (configurável sem alterar código)
CREATE TABLE IF NOT EXISTS public.pontos_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria TEXT NOT NULL,
  tipo_evento TEXT NOT NULL,
  pontos INTEGER NOT NULL,
  ativo BOOLEAN DEFAULT true,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(categoria, tipo_evento)
);

-- Popular regras iniciais para RECEITAS
INSERT INTO public.pontos_regras (categoria, tipo_evento, pontos, descricao) VALUES
('receitas', 'avaliacao_5_estrelas', 10, 'Receita recebeu 5 estrelas'),
('receitas', 'avaliacao_4_estrelas', 7, 'Receita recebeu 4 estrelas'),
('receitas', 'avaliacao_3_estrelas', 4, 'Receita recebeu 3 estrelas'),
('receitas', 'avaliacao_2_estrelas', 0, 'Receita recebeu 2 estrelas'),
('receitas', 'avaliacao_1_estrela', 0, 'Receita recebeu 1 estrela'),
('receitas', 'avaliar_receita', 2, 'Usuário avaliou uma receita'),
('receitas', 'receita_criada', 5, 'Usuário criou uma receita pública')
ON CONFLICT (categoria, tipo_evento) DO NOTHING;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_usuarios_pontos_user ON public.usuarios_pontos(user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_pontos_disponiveis ON public.usuarios_pontos(pontos_disponiveis DESC);
CREATE INDEX IF NOT EXISTS idx_usuarios_pontos_log_user ON public.usuarios_pontos_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_pontos_log_categoria ON public.usuarios_pontos_log(categoria);
CREATE INDEX IF NOT EXISTS idx_usuarios_pontos_log_created ON public.usuarios_pontos_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pontos_regras_categoria ON public.pontos_regras(categoria, tipo_evento);

-- ============================================================
-- FASE 2: SISTEMA DE RECEITAS E AVALIAÇÕES
-- ============================================================

-- Adicionar campos de avaliação na tabela receitas (se não existirem)
ALTER TABLE public.receitas
ADD COLUMN IF NOT EXISTS total_avaliacoes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS soma_estrelas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS media_estrelas NUMERIC(3,2) DEFAULT 0;

-- Índice para ordenação por avaliação
CREATE INDEX IF NOT EXISTS idx_receitas_media_estrelas ON public.receitas(media_estrelas DESC);

-- Tabela de avaliações de receitas
CREATE TABLE IF NOT EXISTS public.receitas_avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL REFERENCES public.receitas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estrelas INTEGER NOT NULL CHECK (estrelas >= 1 AND estrelas <= 5),
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(receita_id, user_id)
);

-- Índices para avaliações
CREATE INDEX IF NOT EXISTS idx_receitas_avaliacoes_receita ON public.receitas_avaliacoes(receita_id);
CREATE INDEX IF NOT EXISTS idx_receitas_avaliacoes_user ON public.receitas_avaliacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_receitas_avaliacoes_estrelas ON public.receitas_avaliacoes(estrelas);

-- Storage bucket para imagens de receitas
INSERT INTO storage.buckets (id, name, public)
VALUES ('receitas-imagens', 'receitas-imagens', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FASE 3: FUNÇÕES SQL
-- ============================================================

-- Função universal para adicionar pontos (modular e escalável)
CREATE OR REPLACE FUNCTION public.adicionar_pontos(
  p_user_id UUID,
  p_categoria TEXT,
  p_tipo_evento TEXT,
  p_descricao TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_receita_id UUID DEFAULT NULL,
  p_avaliacao_id UUID DEFAULT NULL,
  p_nota_id UUID DEFAULT NULL,
  p_produto_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pontos INTEGER;
BEGIN
  -- Buscar quantos pontos vale este evento
  SELECT pontos INTO v_pontos
  FROM public.pontos_regras
  WHERE categoria = p_categoria
    AND tipo_evento = p_tipo_evento
    AND ativo = true;
  
  -- Se não encontrou regra ou pontos = 0, não fazer nada
  IF v_pontos IS NULL OR v_pontos = 0 THEN
    RETURN;
  END IF;
  
  -- Inserir/atualizar pontos do usuário
  INSERT INTO public.usuarios_pontos (user_id, pontos_disponiveis, pontos_totais_ganhos)
  VALUES (p_user_id, v_pontos, v_pontos)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    pontos_disponiveis = usuarios_pontos.pontos_disponiveis + v_pontos,
    pontos_totais_ganhos = usuarios_pontos.pontos_totais_ganhos + v_pontos,
    updated_at = now();
  
  -- Registrar no log
  INSERT INTO public.usuarios_pontos_log (
    user_id, categoria, tipo_evento, pontos_ganhos,
    descricao, metadata,
    receita_id, avaliacao_id, nota_id, produto_id
  )
  VALUES (
    p_user_id, p_categoria, p_tipo_evento, v_pontos,
    p_descricao, p_metadata,
    p_receita_id, p_avaliacao_id, p_nota_id, p_produto_id
  );
END;
$$;

-- Função para atualizar estatísticas de avaliação da receita
CREATE OR REPLACE FUNCTION public.atualizar_estatisticas_receita()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receita_id UUID;
BEGIN
  -- Determinar qual receita foi afetada
  IF TG_OP = 'DELETE' THEN
    v_receita_id := OLD.receita_id;
  ELSE
    v_receita_id := NEW.receita_id;
  END IF;
  
  -- Recalcular estatísticas
  UPDATE public.receitas
  SET 
    total_avaliacoes = (
      SELECT COUNT(*)
      FROM public.receitas_avaliacoes
      WHERE receita_id = v_receita_id
    ),
    soma_estrelas = (
      SELECT COALESCE(SUM(estrelas), 0)
      FROM public.receitas_avaliacoes
      WHERE receita_id = v_receita_id
    ),
    media_estrelas = (
      SELECT COALESCE(ROUND(AVG(estrelas)::numeric, 2), 0)
      FROM public.receitas_avaliacoes
      WHERE receita_id = v_receita_id
    ),
    updated_at = now()
  WHERE id = v_receita_id;
  
  RETURN NEW;
END;
$$;

-- Função para processar pontos ao avaliar receita
CREATE OR REPLACE FUNCTION public.processar_pontos_avaliacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_criador_receita UUID;
  v_tipo_evento TEXT;
BEGIN
  -- Apenas processar em INSERT e UPDATE
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    -- Buscar criador da receita
    SELECT user_id INTO v_criador_receita
    FROM public.receitas
    WHERE id = NEW.receita_id;
    
    -- Determinar tipo de evento baseado nas estrelas
    v_tipo_evento := 'avaliacao_' || NEW.estrelas || 
      CASE WHEN NEW.estrelas = 1 THEN '_estrela' ELSE '_estrelas' END;
    
    -- Dar pontos ao CRIADOR da receita (se mudou a nota em UPDATE)
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.estrelas != NEW.estrelas) THEN
      PERFORM public.adicionar_pontos(
        v_criador_receita,
        'receitas',
        v_tipo_evento,
        format('Sua receita recebeu %s estrelas', NEW.estrelas),
        jsonb_build_object('estrelas', NEW.estrelas, 'avaliacao_id', NEW.id),
        NEW.receita_id,
        NEW.id
      );
    END IF;
    
    -- Dar pontos a quem AVALIOU (apenas em INSERT)
    IF TG_OP = 'INSERT' THEN
      PERFORM public.adicionar_pontos(
        NEW.user_id,
        'receitas',
        'avaliar_receita',
        'Você avaliou uma receita',
        jsonb_build_object('receita_id', NEW.receita_id, 'estrelas', NEW.estrelas),
        NEW.receita_id,
        NEW.id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Função has_role (se não existir)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- ============================================================
-- FASE 4: TRIGGERS
-- ============================================================

-- Trigger para atualizar updated_at em receitas_avaliacoes
DROP TRIGGER IF EXISTS update_receitas_avaliacoes_updated_at ON public.receitas_avaliacoes;
CREATE TRIGGER update_receitas_avaliacoes_updated_at
  BEFORE UPDATE ON public.receitas_avaliacoes
  FOR EACH ROW
  EXECUTE FUNCTION update_receitas_updated_at();

-- Trigger para recalcular estatísticas de receita
DROP TRIGGER IF EXISTS trigger_atualizar_estatisticas_receita ON public.receitas_avaliacoes;
CREATE TRIGGER trigger_atualizar_estatisticas_receita
  AFTER INSERT OR UPDATE OR DELETE ON public.receitas_avaliacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_estatisticas_receita();

-- Trigger para processar pontos de avaliação
DROP TRIGGER IF EXISTS trigger_processar_pontos_avaliacao ON public.receitas_avaliacoes;
CREATE TRIGGER trigger_processar_pontos_avaliacao
  AFTER INSERT OR UPDATE ON public.receitas_avaliacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.processar_pontos_avaliacao();

-- Trigger para updated_at em usuarios_pontos
DROP TRIGGER IF EXISTS update_usuarios_pontos_updated_at ON public.usuarios_pontos;
CREATE TRIGGER update_usuarios_pontos_updated_at
  BEFORE UPDATE ON public.usuarios_pontos
  FOR EACH ROW
  EXECUTE FUNCTION update_receitas_updated_at();

-- ============================================================
-- FASE 5: ROW LEVEL SECURITY (RLS)
-- ============================================================

-- RLS para usuarios_pontos
ALTER TABLE public.usuarios_pontos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver próprios pontos" ON public.usuarios_pontos;
CREATE POLICY "Ver próprios pontos"
ON public.usuarios_pontos FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sistema pode gerenciar pontos" ON public.usuarios_pontos;
CREATE POLICY "Sistema pode gerenciar pontos"
ON public.usuarios_pontos FOR ALL
TO authenticated
USING (true);

-- RLS para usuarios_pontos_log
ALTER TABLE public.usuarios_pontos_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver próprio histórico" ON public.usuarios_pontos_log;
CREATE POLICY "Ver próprio histórico"
ON public.usuarios_pontos_log FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sistema pode criar log" ON public.usuarios_pontos_log;
CREATE POLICY "Sistema pode criar log"
ON public.usuarios_pontos_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- RLS para pontos_regras
ALTER TABLE public.pontos_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ver regras ativas" ON public.pontos_regras;
CREATE POLICY "Todos podem ver regras ativas"
ON public.pontos_regras FOR SELECT
TO authenticated
USING (ativo = true);

-- RLS para receitas_avaliacoes
ALTER TABLE public.receitas_avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver avaliações de receitas públicas" ON public.receitas_avaliacoes;
CREATE POLICY "Ver avaliações de receitas públicas"
ON public.receitas_avaliacoes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.receitas r
    WHERE r.id = receitas_avaliacoes.receita_id
    AND r.publica = true
  )
);

DROP POLICY IF EXISTS "Ver avaliações de próprias receitas" ON public.receitas_avaliacoes;
CREATE POLICY "Ver avaliações de próprias receitas"
ON public.receitas_avaliacoes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.receitas r
    WHERE r.id = receitas_avaliacoes.receita_id
    AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Criar próprias avaliações" ON public.receitas_avaliacoes;
CREATE POLICY "Criar próprias avaliações"
ON public.receitas_avaliacoes FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.receitas r
    WHERE r.id = receita_id
    AND r.publica = true
    AND r.user_id != auth.uid()
  )
);

DROP POLICY IF EXISTS "Atualizar próprias avaliações" ON public.receitas_avaliacoes;
CREATE POLICY "Atualizar próprias avaliações"
ON public.receitas_avaliacoes FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Deletar próprias avaliações" ON public.receitas_avaliacoes;
CREATE POLICY "Deletar próprias avaliações"
ON public.receitas_avaliacoes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS para storage de receitas-imagens
DROP POLICY IF EXISTS "Usuários podem fazer upload de imagens de receitas" ON storage.objects;
CREATE POLICY "Usuários podem fazer upload de imagens de receitas"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receitas-imagens' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Usuários podem ver imagens de receitas" ON storage.objects;
CREATE POLICY "Usuários podem ver imagens de receitas"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receitas-imagens');

DROP POLICY IF EXISTS "Usuários podem deletar suas imagens" ON storage.objects;
CREATE POLICY "Usuários podem deletar suas imagens"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receitas-imagens' AND
  (storage.foldername(name))[1] = auth.uid()::text
);