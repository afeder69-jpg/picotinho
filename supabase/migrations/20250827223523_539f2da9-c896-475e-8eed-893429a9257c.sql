-- Criar tabela para normalizações de nomes de produtos
CREATE TABLE public.normalizacoes_nomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  termo_errado TEXT NOT NULL,
  termo_correto TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ativo BOOLEAN NOT NULL DEFAULT true
);

-- Habilitar RLS na tabela
ALTER TABLE public.normalizacoes_nomes ENABLE ROW LEVEL SECURITY;

-- Política para permitir leitura pública (todos os usuários podem usar as normalizações)
CREATE POLICY "Todos podem ler normalizações" 
ON public.normalizacoes_nomes 
FOR SELECT 
USING (ativo = true);

-- Política para permitir inserção apenas por usuários autenticados (para futuras adições via admin)
CREATE POLICY "Admins podem inserir normalizações" 
ON public.normalizacoes_nomes 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Criar índice para otimizar buscas
CREATE INDEX idx_normalizacoes_termo_errado ON public.normalizacoes_nomes(termo_errado);

-- Inserir as regras iniciais de normalização
INSERT INTO public.normalizacoes_nomes (termo_errado, termo_correto) VALUES
('MAMO', 'MAMÃO'),
('GRAENC', 'GRANEL'),
('MUARELA', 'MUÇARELA'),
('TOMY', 'TOMMY'),
('REQUEIJAO ZILAC', 'REQUEIJÃO ZILAC'),
-- Regras existentes do código atual
('GRANEL', 'GRANEL'),
('REQUEIJAO', 'REQUEIJAO'),
('BISC0IT0', 'BISCOITO'),
('L3IT3', 'LEITE'),
('ÇUCAR', 'AÇUCAR'),
('ARR0Z', 'ARROZ'),
('FEIJÃ0', 'FEIJAO'),
('MARACUJÁ', 'MARACUJA'),
('MARACUJA', 'MARACUJA'),
('LIMÃO', 'LIMAO'),
('LIMAO', 'LIMAO'),
('MAMÃO', 'MAMAO'),
('MAMAO', 'MAMAO'),
('MUÇARELA', 'MUCARELA'),
('MUCARELA', 'MUCARELA'),
('AÇUCAR', 'ACUCAR'),
('ACUCAR', 'ACUCAR');