-- Criar tabela de avaliações de receitas
CREATE TABLE IF NOT EXISTS public.receitas_avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL REFERENCES public.receitas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estrelas INTEGER NOT NULL CHECK (estrelas >= 1 AND estrelas <= 5),
  comentario TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(receita_id, user_id)
);

-- Habilitar RLS
ALTER TABLE public.receitas_avaliacoes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Todos podem ver avaliações de receitas públicas"
ON public.receitas_avaliacoes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.receitas r
    WHERE r.id = receita_id AND r.publica = true
  )
);

CREATE POLICY "Usuários autenticados podem criar avaliações"
ON public.receitas_avaliacoes
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.receitas r
    WHERE r.id = receita_id 
    AND r.publica = true 
    AND r.user_id != auth.uid()
  )
);

CREATE POLICY "Usuários podem atualizar suas próprias avaliações"
ON public.receitas_avaliacoes
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias avaliações"
ON public.receitas_avaliacoes
FOR DELETE
USING (auth.uid() = user_id);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_avaliacoes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_avaliacoes_updated_at
BEFORE UPDATE ON public.receitas_avaliacoes
FOR EACH ROW
EXECUTE FUNCTION update_avaliacoes_updated_at();

-- Função para atualizar média e total de avaliações na receita
CREATE OR REPLACE FUNCTION atualizar_estatisticas_receita()
RETURNS TRIGGER AS $$
DECLARE
  v_receita_id UUID;
BEGIN
  -- Determinar qual receita_id usar
  IF TG_OP = 'DELETE' THEN
    v_receita_id := OLD.receita_id;
  ELSE
    v_receita_id := NEW.receita_id;
  END IF;
  
  -- Atualizar estatísticas da receita
  UPDATE public.receitas
  SET 
    media_estrelas = (
      SELECT COALESCE(AVG(estrelas), 0)
      FROM public.receitas_avaliacoes
      WHERE receita_id = v_receita_id
    ),
    total_avaliacoes = (
      SELECT COUNT(*)
      FROM public.receitas_avaliacoes
      WHERE receita_id = v_receita_id
    ),
    updated_at = now()
  WHERE id = v_receita_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers para atualizar estatísticas
CREATE TRIGGER trigger_atualizar_estatisticas_insert
AFTER INSERT ON public.receitas_avaliacoes
FOR EACH ROW
EXECUTE FUNCTION atualizar_estatisticas_receita();

CREATE TRIGGER trigger_atualizar_estatisticas_update
AFTER UPDATE ON public.receitas_avaliacoes
FOR EACH ROW
EXECUTE FUNCTION atualizar_estatisticas_receita();

CREATE TRIGGER trigger_atualizar_estatisticas_delete
AFTER DELETE ON public.receitas_avaliacoes
FOR EACH ROW
EXECUTE FUNCTION atualizar_estatisticas_receita();

-- Índices para performance
CREATE INDEX idx_receitas_avaliacoes_receita_id ON public.receitas_avaliacoes(receita_id);
CREATE INDEX idx_receitas_avaliacoes_user_id ON public.receitas_avaliacoes(user_id);