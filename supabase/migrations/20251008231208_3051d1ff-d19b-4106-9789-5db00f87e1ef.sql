-- =====================================================
-- ETAPA 1: MODELAGEM DE DADOS - MÓDULO RECEITAS
-- Picotinho App - Não altera nada existente
-- =====================================================

-- 1️⃣ CRIAR ENUMS
CREATE TYPE public.fonte_receita AS ENUM ('minha', 'picotinho', 'comunidade', 'api_externa');
CREATE TYPE public.status_receita AS ENUM ('rascunho', 'publicada', 'arquivada');
CREATE TYPE public.tipo_disponibilidade AS ENUM ('completo', 'parcial', 'faltando');

-- 2️⃣ TABELA: receitas
CREATE TABLE public.receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- NULL = receita do Picotinho
  titulo TEXT NOT NULL,
  descricao TEXT,
  instrucoes TEXT NOT NULL,
  tempo_preparo INTEGER, -- minutos
  porcoes INTEGER DEFAULT 1,
  imagem_url TEXT,
  imagem_path TEXT,
  fonte fonte_receita NOT NULL DEFAULT 'minha',
  status status_receita NOT NULL DEFAULT 'publicada',
  publica BOOLEAN NOT NULL DEFAULT FALSE, -- opt-in comunidade
  api_source_id TEXT, -- ID original da API (ex: TheMealDB idMeal)
  api_source_name TEXT, -- nome da API (ex: 'themealdb')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3️⃣ TABELA: receita_ingredientes
CREATE TABLE public.receita_ingredientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL REFERENCES public.receitas(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.estoque_app(id) ON DELETE SET NULL, -- vincula ao estoque
  produto_nome_busca TEXT NOT NULL, -- fallback se não encontrar produto_id
  quantidade NUMERIC NOT NULL,
  unidade_medida TEXT NOT NULL, -- 'g', 'ml', 'un', etc.
  opcional BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4️⃣ TABELA: cardapios
CREATE TABLE public.cardapios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  semana_inicio DATE NOT NULL,
  semana_fim DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5️⃣ TABELA: cardapio_receitas
CREATE TABLE public.cardapio_receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cardapio_id UUID NOT NULL REFERENCES public.cardapios(id) ON DELETE CASCADE,
  receita_id UUID NOT NULL REFERENCES public.receitas(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo, 6=sábado
  refeicao TEXT NOT NULL, -- 'café', 'almoço', 'jantar', 'lanche'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cardapio_id, dia_semana, refeicao)
);

-- 6️⃣ TABELA: listas_compras (preparação para aba futura)
CREATE TABLE public.listas_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('receita', 'cardapio', 'manual')),
  receita_id UUID REFERENCES public.receitas(id) ON DELETE CASCADE,
  cardapio_id UUID REFERENCES public.cardapios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7️⃣ TABELA: listas_compras_itens
CREATE TABLE public.listas_compras_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id UUID NOT NULL REFERENCES public.listas_compras(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.estoque_app(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL,
  quantidade NUMERIC NOT NULL,
  unidade_medida TEXT NOT NULL,
  comprado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8️⃣ ÍNDICES (Performance)
CREATE INDEX idx_receitas_user_id ON public.receitas(user_id);
CREATE INDEX idx_receitas_fonte ON public.receitas(fonte);
CREATE INDEX idx_receitas_publica ON public.receitas(publica) WHERE publica = TRUE;
CREATE INDEX idx_receitas_api_source ON public.receitas(api_source_id, api_source_name);
CREATE INDEX idx_receita_ingredientes_receita ON public.receita_ingredientes(receita_id);
CREATE INDEX idx_receita_ingredientes_produto ON public.receita_ingredientes(produto_id);
CREATE INDEX idx_cardapios_user ON public.cardapios(user_id);
CREATE INDEX idx_cardapio_receitas_cardapio ON public.cardapio_receitas(cardapio_id);
CREATE INDEX idx_listas_compras_user ON public.listas_compras(user_id);
CREATE INDEX idx_listas_compras_itens_lista ON public.listas_compras_itens(lista_id);

-- 9️⃣ RLS POLICIES

-- RECEITAS
ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas próprias receitas"
  ON public.receitas FOR SELECT
  USING (auth.uid() = user_id OR publica = TRUE OR fonte IN ('picotinho', 'api_externa'));

CREATE POLICY "Usuários podem criar suas receitas"
  ON public.receitas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas receitas"
  ON public.receitas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas receitas"
  ON public.receitas FOR DELETE
  USING (auth.uid() = user_id);

-- RECEITA_INGREDIENTES
ALTER TABLE public.receita_ingredientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver ingredientes de receitas visíveis"
  ON public.receita_ingredientes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.receitas r
      WHERE r.id = receita_ingredientes.receita_id
        AND (r.user_id = auth.uid() OR r.publica = TRUE OR r.fonte IN ('picotinho', 'api_externa'))
    )
  );

CREATE POLICY "Usuários podem gerenciar ingredientes de suas receitas"
  ON public.receita_ingredientes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.receitas r
      WHERE r.id = receita_ingredientes.receita_id
        AND r.user_id = auth.uid()
    )
  );

-- CARDÁPIOS
ALTER TABLE public.cardapios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seus cardápios"
  ON public.cardapios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar cardápios"
  ON public.cardapios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus cardápios"
  ON public.cardapios FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus cardápios"
  ON public.cardapios FOR DELETE
  USING (auth.uid() = user_id);

-- CARDAPIO_RECEITAS
ALTER TABLE public.cardapio_receitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem gerenciar receitas de seus cardápios"
  ON public.cardapio_receitas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.cardapios c
      WHERE c.id = cardapio_receitas.cardapio_id
        AND c.user_id = auth.uid()
    )
  );

-- LISTAS_COMPRAS
ALTER TABLE public.listas_compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas listas"
  ON public.listas_compras FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar listas"
  ON public.listas_compras FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas listas"
  ON public.listas_compras FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas listas"
  ON public.listas_compras FOR DELETE
  USING (auth.uid() = user_id);

-- LISTAS_COMPRAS_ITENS
ALTER TABLE public.listas_compras_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem gerenciar itens de suas listas"
  ON public.listas_compras_itens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listas_compras l
      WHERE l.id = listas_compras_itens.lista_id
        AND l.user_id = auth.uid()
    )
  );

-- 🔟 TRIGGER: updated_at automático
CREATE OR REPLACE FUNCTION public.update_receitas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER receitas_updated_at
  BEFORE UPDATE ON public.receitas
  FOR EACH ROW EXECUTE FUNCTION public.update_receitas_updated_at();

CREATE TRIGGER cardapios_updated_at
  BEFORE UPDATE ON public.cardapios
  FOR EACH ROW EXECUTE FUNCTION public.update_receitas_updated_at();

CREATE TRIGGER listas_compras_updated_at
  BEFORE UPDATE ON public.listas_compras
  FOR EACH ROW EXECUTE FUNCTION public.update_receitas_updated_at();

-- ✅ ETAPA 1 CONCLUÍDA