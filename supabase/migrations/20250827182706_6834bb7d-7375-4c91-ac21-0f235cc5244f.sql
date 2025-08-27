-- Criar tabela de estoque
CREATE TABLE public.estoque_app (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  produto_nome VARCHAR NOT NULL,
  categoria VARCHAR NOT NULL,
  unidade_medida VARCHAR NOT NULL DEFAULT 'UN',
  quantidade NUMERIC NOT NULL DEFAULT 0,
  preco_unitario_ultimo NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.estoque_app ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para estoque
CREATE POLICY "Usuários podem visualizar seu estoque" 
ON public.estoque_app 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar itens no seu estoque" 
ON public.estoque_app 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seu estoque" 
ON public.estoque_app 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar itens do seu estoque" 
ON public.estoque_app 
FOR DELETE 
USING (auth.uid() = user_id);

-- Criar índices para performance
CREATE INDEX idx_estoque_app_user_id ON public.estoque_app(user_id);
CREATE INDEX idx_estoque_app_produto ON public.estoque_app(user_id, produto_nome);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_estoque_app_updated_at
BEFORE UPDATE ON public.estoque_app
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();