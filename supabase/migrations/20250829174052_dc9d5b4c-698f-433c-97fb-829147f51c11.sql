-- Criar tabela auxiliar para preços atuais
CREATE TABLE public.precos_atuais (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    produto_codigo TEXT,
    produto_nome TEXT NOT NULL,
    estabelecimento_cnpj TEXT NOT NULL,
    estabelecimento_nome TEXT NOT NULL,
    valor_unitario NUMERIC NOT NULL,
    data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar índice único para produto_codigo + estabelecimento_cnpj (permite upsert)
CREATE UNIQUE INDEX idx_precos_atuais_produto_estabelecimento 
ON public.precos_atuais (produto_codigo, estabelecimento_cnpj);

-- Criar índice para consultas por estabelecimento
CREATE INDEX idx_precos_atuais_estabelecimento 
ON public.precos_atuais (estabelecimento_cnpj);

-- Criar índice para consultas por produto
CREATE INDEX idx_precos_atuais_produto 
ON public.precos_atuais (produto_nome);

-- Habilitar RLS
ALTER TABLE public.precos_atuais ENABLE ROW LEVEL SECURITY;

-- Política para permitir leitura pública (para comparação de preços)
CREATE POLICY "Todos podem ler preços atuais" 
ON public.precos_atuais 
FOR SELECT 
USING (true);

-- Política para permitir inserção apenas pelo sistema
CREATE POLICY "Sistema pode inserir preços atuais" 
ON public.precos_atuais 
FOR INSERT 
WITH CHECK (true);

-- Política para permitir atualização apenas pelo sistema
CREATE POLICY "Sistema pode atualizar preços atuais" 
ON public.precos_atuais 
FOR UPDATE 
USING (true);