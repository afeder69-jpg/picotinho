-- Criar tabela de receitas públicas brasileiras
CREATE TABLE IF NOT EXISTS public.receitas_publicas_brasileiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  categoria TEXT,
  modo_preparo TEXT,
  ingredientes JSONB NOT NULL DEFAULT '[]'::jsonb,
  tempo_preparo INTEGER, -- em minutos
  rendimento TEXT,
  imagem_url TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  fonte TEXT DEFAULT 'receitas-json',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_receitas_publicas_titulo ON public.receitas_publicas_brasileiras USING gin(to_tsvector('portuguese', titulo));
CREATE INDEX IF NOT EXISTS idx_receitas_publicas_categoria ON public.receitas_publicas_brasileiras(categoria);
CREATE INDEX IF NOT EXISTS idx_receitas_publicas_tags ON public.receitas_publicas_brasileiras USING gin(tags);

-- RLS: Todos podem ler receitas públicas
ALTER TABLE public.receitas_publicas_brasileiras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem ler receitas públicas brasileiras"
  ON public.receitas_publicas_brasileiras
  FOR SELECT
  USING (true);

-- Apenas sistema pode inserir/atualizar (via Edge Functions)
CREATE POLICY "Sistema pode gerenciar receitas públicas"
  ON public.receitas_publicas_brasileiras
  FOR ALL
  USING (
    current_setting('role', true) = 'service_role' 
    OR auth.role() = 'service_role'
  );

COMMENT ON TABLE public.receitas_publicas_brasileiras IS 'Receitas públicas brasileiras importadas do repositório receitas-json (8.182 receitas)';