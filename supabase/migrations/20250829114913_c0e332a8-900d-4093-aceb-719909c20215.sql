-- Criar tabela de notas fiscais
CREATE TABLE public.notas_fiscais (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    mercado TEXT,
    bairro TEXT,
    cnpj TEXT,
    data_compra TIMESTAMP WITH TIME ZONE,
    valor_total NUMERIC(10,2),
    qtd_itens INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de itens da nota
CREATE TABLE public.itens_nota (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nota_id UUID NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    codigo TEXT,
    quantidade NUMERIC(10,3),
    unidade TEXT,
    valor_unitario NUMERIC(10,2),
    valor_total NUMERIC(10,2),
    categoria TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS nas tabelas
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_nota ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para notas_fiscais
CREATE POLICY "Usuários podem visualizar suas notas fiscais" 
ON public.notas_fiscais 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar suas notas fiscais" 
ON public.notas_fiscais 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas notas fiscais" 
ON public.notas_fiscais 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas notas fiscais" 
ON public.notas_fiscais 
FOR DELETE 
USING (auth.uid() = user_id);

-- Políticas RLS para itens_nota
CREATE POLICY "Usuários podem visualizar itens de suas notas" 
ON public.itens_nota 
FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.notas_fiscais 
    WHERE notas_fiscais.id = itens_nota.nota_id 
    AND notas_fiscais.user_id = auth.uid()
));

CREATE POLICY "Usuários podem inserir itens em suas notas" 
ON public.itens_nota 
FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM public.notas_fiscais 
    WHERE notas_fiscais.id = itens_nota.nota_id 
    AND notas_fiscais.user_id = auth.uid()
));

CREATE POLICY "Usuários podem atualizar itens de suas notas" 
ON public.itens_nota 
FOR UPDATE 
USING (EXISTS (
    SELECT 1 FROM public.notas_fiscais 
    WHERE notas_fiscais.id = itens_nota.nota_id 
    AND notas_fiscais.user_id = auth.uid()
));

CREATE POLICY "Usuários podem deletar itens de suas notas" 
ON public.itens_nota 
FOR DELETE 
USING (EXISTS (
    SELECT 1 FROM public.notas_fiscais 
    WHERE notas_fiscais.id = itens_nota.nota_id 
    AND notas_fiscais.user_id = auth.uid()
));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_notas_fiscais_updated_at
    BEFORE UPDATE ON public.notas_fiscais
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();