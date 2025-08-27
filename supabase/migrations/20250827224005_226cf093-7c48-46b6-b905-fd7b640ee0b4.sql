-- Adicionar regras de normalização baseadas em erros comuns de OCR/IA
INSERT INTO public.normalizacoes_nomes (termo_errado, termo_correto) VALUES
-- Regras solicitadas pelo usuário
('MAMO', 'MAMÃO'),
('MUARELA', 'MUÇARELA'),
('MUSSARELA', 'MUÇARELA'),
('GRAENC', 'GRANEL'),
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
('REQUEIJAO ZILAC', 'REQUEIJÃO ZILAC'),
('BISC0IT0', 'BISCOITO'),
('BISCOITO', 'BISCOITO'),
('L3IT3', 'LEITE'),
('LEITE', 'LEITE'),
('ARR0Z', 'ARROZ'),
('ARROZ', 'ARROZ'),
('FEIJÃ0', 'FEIJÃO'),
('FEIJAO', 'FEIJÃO'),
('AÇUCAR', 'AÇÚCAR'),
('ACUCAR', 'AÇÚCAR'),
('ÇUCAR', 'AÇÚCAR'),

-- Variações de marcas e produtos comuns
('WICKBOLD', 'WICKBOLD'),
('PULLMAN', 'PULLMAN'),
('NESCAU', 'NESCAU'),
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

-- Remover possíveis duplicatas mantendo as mais recentes
DELETE FROM normalizacoes_nomes a USING normalizacoes_nomes b 
WHERE a.id < b.id 
AND a.termo_errado = b.termo_errado;