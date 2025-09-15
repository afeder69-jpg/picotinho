-- Adicionar marcas necessárias para os testes
INSERT INTO marcas_conhecidas (nome, ativo) VALUES
('PREDILETO', true),
('YPE', true),
('TIXAN', true)
ON CONFLICT (nome) DO NOTHING;

-- Log das marcas adicionadas
DO $$
BEGIN
    RAISE NOTICE 'Marcas adicionadas para teste de normalização: PREDILETO, YPE, TIXAN';
END $$;