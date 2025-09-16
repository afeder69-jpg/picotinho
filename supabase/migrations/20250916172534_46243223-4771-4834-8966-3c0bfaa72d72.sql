-- Expandir tabela profiles com novos campos
ALTER TABLE public.profiles 
ADD COLUMN nome_completo TEXT,
ADD COLUMN email TEXT,
ADD COLUMN bairro TEXT,
ADD COLUMN cidade TEXT,
ADD COLUMN cep VARCHAR(9),
ADD COLUMN latitude NUMERIC,
ADD COLUMN longitude NUMERIC;

-- Índice para busca por CEP
CREATE INDEX idx_profiles_cep ON public.profiles(cep) WHERE cep IS NOT NULL;