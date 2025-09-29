-- Criar tabela consumos_app para registrar saídas do estoque
CREATE TABLE public.consumos_app (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    produto_id UUID NOT NULL REFERENCES public.estoque_app(id) ON DELETE CASCADE,
    quantidade DECIMAL NOT NULL CHECK (quantidade > 0),
    data_consumo TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS na tabela
ALTER TABLE public.consumos_app ENABLE ROW LEVEL SECURITY;

-- Criar políticas de RLS
CREATE POLICY "Usuários podem ver seus próprios consumos" 
ON public.consumos_app 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus próprios consumos" 
ON public.consumos_app 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus próprios consumos" 
ON public.consumos_app 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios consumos" 
ON public.consumos_app 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_consumos_app_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_consumos_app_updated_at
    BEFORE UPDATE ON public.consumos_app
    FOR EACH ROW
    EXECUTE FUNCTION public.update_consumos_app_updated_at();

-- Criar índices para performance
CREATE INDEX idx_consumos_app_user_id ON public.consumos_app(user_id);
CREATE INDEX idx_consumos_app_produto_id ON public.consumos_app(produto_id);
CREATE INDEX idx_consumos_app_data_consumo ON public.consumos_app(data_consumo);