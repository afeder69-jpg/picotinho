-- Verificar se tabela itens_nota existe, se não criar
CREATE TABLE IF NOT EXISTS public.itens_nota (
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

-- Adicionar colunas faltantes na tabela notas_fiscais se não existirem
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notas_fiscais' AND column_name='bairro') THEN
        ALTER TABLE public.notas_fiscais ADD COLUMN bairro TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notas_fiscais' AND column_name='cnpj') THEN
        ALTER TABLE public.notas_fiscais ADD COLUMN cnpj TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notas_fiscais' AND column_name='qtd_itens') THEN
        ALTER TABLE public.notas_fiscais ADD COLUMN qtd_itens INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notas_fiscais' AND column_name='updated_at') THEN
        ALTER TABLE public.notas_fiscais ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
END $$;

-- Habilitar RLS se não estiver habilitado
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_nota ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS para itens_nota se não existirem
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'itens_nota' AND policyname = 'Usuários podem visualizar itens de suas notas') THEN
        CREATE POLICY "Usuários podem visualizar itens de suas notas" 
        ON public.itens_nota 
        FOR SELECT 
        USING (EXISTS (
            SELECT 1 FROM public.notas_fiscais 
            WHERE notas_fiscais.id = itens_nota.nota_id 
            AND notas_fiscais.user_id = auth.uid()
        ));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'itens_nota' AND policyname = 'Usuários podem inserir itens em suas notas') THEN
        CREATE POLICY "Usuários podem inserir itens em suas notas" 
        ON public.itens_nota 
        FOR INSERT 
        WITH CHECK (EXISTS (
            SELECT 1 FROM public.notas_fiscais 
            WHERE notas_fiscais.id = itens_nota.nota_id 
            AND notas_fiscais.user_id = auth.uid()
        ));
    END IF;
END $$;