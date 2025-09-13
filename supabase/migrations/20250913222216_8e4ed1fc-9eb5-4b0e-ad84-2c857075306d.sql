-- Criar tabela para normalização de nomes de estabelecimentos
CREATE TABLE IF NOT EXISTS public.normalizacoes_estabelecimentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_original TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inserir mapeamentos iniciais
INSERT INTO public.normalizacoes_estabelecimentos (nome_original, nome_normalizado) VALUES
('TORRE & CIA SUPERMERCADOS S.A.', 'SUPERMARKET'),
('COSTAZUL ALIMENTOS LTDA', 'COSTAZUL'),
('CARREFOUR COMERCIO E INDUSTRIA LTDA', 'CARREFOUR'),
('SUPERDELLI ATACADÃO SUPERMERCADO', 'SUPERDELLI');

-- RLS policies
ALTER TABLE public.normalizacoes_estabelecimentos ENABLE ROW LEVEL SECURITY;

-- Sistema pode gerenciar normalizações
CREATE POLICY "Sistema pode gerenciar normalizações de estabelecimentos"
ON public.normalizacoes_estabelecimentos
FOR ALL
USING (current_setting('role', true) = 'service_role' OR auth.role() = 'authenticated');

-- Todos podem ler normalizações ativas
CREATE POLICY "Todos podem ler normalizações ativas de estabelecimentos"
ON public.normalizacoes_estabelecimentos
FOR SELECT
USING (ativo = true);

-- Função para normalizar nome de estabelecimento
CREATE OR REPLACE FUNCTION public.normalizar_nome_estabelecimento(nome_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    nome_normalizado TEXT;
    normalizacao_record RECORD;
BEGIN
    -- Se nome é null ou vazio, retornar vazio
    IF nome_input IS NULL OR TRIM(nome_input) = '' THEN
        RETURN '';
    END IF;
    
    -- Começar com o nome em maiúsculas e limpo
    nome_normalizado := UPPER(TRIM(nome_input));
    
    -- Aplicar normalizações da tabela
    FOR normalizacao_record IN 
        SELECT nome_original, nome_normalizado as novo_nome
        FROM normalizacoes_estabelecimentos 
        WHERE ativo = true
        ORDER BY LENGTH(nome_original) DESC -- Processar nomes mais longos primeiro
    LOOP
        -- Verificar se o nome contém o padrão original
        IF nome_normalizado LIKE '%' || UPPER(normalizacao_record.nome_original) || '%' THEN
            nome_normalizado := normalizacao_record.novo_nome;
            EXIT; -- Parar no primeiro match
        END IF;
    END LOOP;
    
    RETURN nome_normalizado;
END;
$$;