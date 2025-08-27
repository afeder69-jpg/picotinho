-- Primeiro, adicionar constraint única na coluna termo_errado
ALTER TABLE public.normalizacoes_nomes 
ADD CONSTRAINT unique_termo_errado UNIQUE (termo_errado);

-- Agora inserir as regras de normalização baseadas em erros comuns de OCR/IA
INSERT INTO public.normalizacoes_nomes (termo_errado, termo_correto) VALUES
-- Regras solicitadas pelo usuário
('MUARELA', 'MUÇARELA'),
('MUSSARELA', 'MUÇARELA'),
('TOMY', 'TOMMY'),
('TOMI', 'TOMMY'),
('LIMAO', 'LIMÃO'),
('MARACUJA', 'MARACUJÁ'),
('BANNA', 'BANANA'),
('REQUEIJAO', 'REQUEIJÃO'),
('CREME DE LEI', 'CREME DE LEITE'),
('PAO', 'PÃO'),
('INTEGRAL NUTRICAO', 'INTEGRAL NUTRIÇÃO'),
('ACHOCOLATDO', 'ACHOCOLATADO'),
('NESTLE', 'NESTLÉ'),
('ENERG', 'ENERGY'),

-- Adicionais para variações comuns
('MAMAO', 'MAMÃO'),
('BISC0IT0', 'BISCOITO'),
('L3IT3', 'LEITE'),
('ARR0Z', 'ARROZ'),
('FEIJÃ0', 'FEIJÃO'),
('FEIJAO', 'FEIJÃO'),
('AÇUCAR', 'AÇÚCAR'),
('ACUCAR', 'AÇÚCAR'),
('ÇUCAR', 'AÇÚCAR'),

-- Variações de marcas e produtos comuns
('COCA COLA', 'COCA-COLA'),
('PEPSI COLA', 'PEPSI'),

-- Correções de unidades
('GR', 'G'),
('GRAMAS', 'G'),
('QUILOS', 'KG'),
('LITROS', 'L'),
('MILILITROS', 'ML')

ON CONFLICT (termo_errado) DO UPDATE SET 
    termo_correto = EXCLUDED.termo_correto,
    criado_em = now();