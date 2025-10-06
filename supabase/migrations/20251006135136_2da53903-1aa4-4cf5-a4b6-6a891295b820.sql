-- Adicionar coluna sku_global
ALTER TABLE public.estoque_app
ADD COLUMN sku_global TEXT;

-- Adicionar coluna produto_master_id com FK
ALTER TABLE public.estoque_app
ADD COLUMN produto_master_id UUID REFERENCES public.produtos_master_global(id) ON DELETE SET NULL;

-- Adicionar coluna imagem_url
ALTER TABLE public.estoque_app
ADD COLUMN imagem_url TEXT;

-- Criar índices para performance
CREATE INDEX idx_estoque_app_sku_global ON public.estoque_app(sku_global);
CREATE INDEX idx_estoque_app_produto_master_id ON public.estoque_app(produto_master_id);
CREATE INDEX idx_estoque_app_user_sku ON public.estoque_app(user_id, sku_global);

-- Adicionar comentários
COMMENT ON COLUMN public.estoque_app.sku_global IS 'SKU global do produto no catálogo master';
COMMENT ON COLUMN public.estoque_app.produto_master_id IS 'Referência ao produto no catálogo global (produtos_master_global)';
COMMENT ON COLUMN public.estoque_app.imagem_url IS 'URL da imagem do produto para exibição rápida';