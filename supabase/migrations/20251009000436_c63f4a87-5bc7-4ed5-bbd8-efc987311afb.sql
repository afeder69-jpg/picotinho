-- Adicionar colunas que faltam na tabela receitas
ALTER TABLE public.receitas 
ADD COLUMN IF NOT EXISTS categoria TEXT,
ADD COLUMN IF NOT EXISTS modo_preparo TEXT,
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Criar índices para otimizar buscas
CREATE INDEX IF NOT EXISTS idx_receitas_categoria ON public.receitas(categoria);

-- Comentários
COMMENT ON COLUMN public.receitas.categoria IS 'Categoria da receita (ex: Sobremesa, Prato Principal, etc)';
COMMENT ON COLUMN public.receitas.modo_preparo IS 'Instruções de preparo da receita';
COMMENT ON COLUMN public.receitas.video_url IS 'Link para vídeo da receita (ex: YouTube)';