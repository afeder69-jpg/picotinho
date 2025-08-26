-- Criação do banco de dados completo para o aplicativo Notinha

-- 1. Tabela de Categorias
CREATE TABLE public.categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao TEXT,
    icone VARCHAR(50), -- Para usar ícones na interface
    cor VARCHAR(7), -- Código hex para cores (#FF5733)
    ativa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabela de Supermercados  
CREATE TABLE public.supermercados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(200) NOT NULL,
    cnpj VARCHAR(14) UNIQUE NOT NULL,
    endereco TEXT,
    cidade VARCHAR(100),
    estado VARCHAR(2),
    cep VARCHAR(8),
    telefone VARCHAR(15),
    email VARCHAR(255),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Tabela de Produtos
CREATE TABLE public.produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    categoria_id UUID NOT NULL REFERENCES public.categorias(id) ON DELETE RESTRICT,
    marca VARCHAR(100),
    unidade_medida VARCHAR(20) NOT NULL, -- kg, L, pacote, unidade, etc
    codigo_barras VARCHAR(50), -- EAN, código de barras
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Tabela de Compras
CREATE TABLE public.compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    supermercado_id UUID NOT NULL REFERENCES public.supermercados(id) ON DELETE RESTRICT,
    data_compra DATE NOT NULL,
    hora_compra TIME,
    preco_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    desconto NUMERIC(10,2) DEFAULT 0.00,
    taxa_servico NUMERIC(10,2) DEFAULT 0.00,
    forma_pagamento VARCHAR(50), -- dinheiro, cartao_credito, cartao_debito, pix
    qr_code_url TEXT, -- URL original do QR code da nota fiscal
    numero_nota_fiscal VARCHAR(100),
    chave_acesso VARCHAR(44), -- Chave de acesso da NFCe/NFe
    status VARCHAR(20) DEFAULT 'processada', -- pendente, processada, erro
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Tabela de Itens da Compra
CREATE TABLE public.itens_compra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id UUID NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
    preco_total NUMERIC(10,2) NOT NULL CHECK (preco_total >= 0),
    desconto_item NUMERIC(10,2) DEFAULT 0.00,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. Tabela de Histórico de Preços (para análises futuras)
CREATE TABLE public.historico_precos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    supermercado_id UUID NOT NULL REFERENCES public.supermercados(id) ON DELETE CASCADE,
    preco NUMERIC(10,2) NOT NULL,
    data_preco DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ÍNDICES para performance
CREATE INDEX idx_produtos_categoria ON public.produtos(categoria_id);
CREATE INDEX idx_produtos_nome ON public.produtos(nome);
CREATE INDEX idx_produtos_codigo_barras ON public.produtos(codigo_barras);
CREATE INDEX idx_compras_user_id ON public.compras(user_id);
CREATE INDEX idx_compras_supermercado ON public.compras(supermercado_id);
CREATE INDEX idx_compras_data ON public.compras(data_compra);
CREATE INDEX idx_itens_compra_compra_id ON public.itens_compra(compra_id);
CREATE INDEX idx_itens_compra_produto_id ON public.itens_compra(produto_id);
CREATE INDEX idx_historico_precos_produto ON public.historico_precos(produto_id, supermercado_id, data_preco);

-- TRIGGERS para cálculos automáticos

-- Trigger para atualizar o campo updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em todas as tabelas necessárias
CREATE TRIGGER update_categorias_updated_at BEFORE UPDATE ON public.categorias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_supermercados_updated_at BEFORE UPDATE ON public.supermercados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_produtos_updated_at BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_compras_updated_at BEFORE UPDATE ON public.compras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para calcular preco_total em itens_compra
CREATE OR REPLACE FUNCTION public.calculate_item_total()
RETURNS TRIGGER AS $$
BEGIN
    NEW.preco_total = (NEW.quantidade * NEW.preco_unitario) - COALESCE(NEW.desconto_item, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_itens_compra_total
    BEFORE INSERT OR UPDATE ON public.itens_compra
    FOR EACH ROW EXECUTE FUNCTION public.calculate_item_total();

-- Trigger para atualizar o total da compra quando itens são modificados
CREATE OR REPLACE FUNCTION public.update_compra_total()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualiza o total da compra somando todos os itens
    UPDATE public.compras 
    SET preco_total = (
        SELECT COALESCE(SUM(preco_total), 0) 
        FROM public.itens_compra 
        WHERE compra_id = COALESCE(NEW.compra_id, OLD.compra_id)
    )
    WHERE id = COALESCE(NEW.compra_id, OLD.compra_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_compra_total_on_item_change
    AFTER INSERT OR UPDATE OR DELETE ON public.itens_compra
    FOR EACH ROW EXECUTE FUNCTION public.update_compra_total();

-- Trigger para inserir no histórico de preços
CREATE OR REPLACE FUNCTION public.insert_historico_precos()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.historico_precos (produto_id, supermercado_id, preco, data_preco)
    SELECT 
        NEW.produto_id,
        c.supermercado_id,
        NEW.preco_unitario,
        c.data_compra
    FROM public.compras c
    WHERE c.id = NEW.compra_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER insert_historico_precos_trigger
    AFTER INSERT ON public.itens_compra
    FOR EACH ROW EXECUTE FUNCTION public.insert_historico_precos();

-- HABILITAR RLS (Row Level Security) em todas as tabelas
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supermercados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_precos ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS

-- Categorias - todos podem ler, apenas admins podem modificar
CREATE POLICY "Todos podem visualizar categorias" ON public.categorias FOR SELECT USING (true);
CREATE POLICY "Apenas admins podem gerenciar categorias" ON public.categorias FOR ALL USING (false); -- Será atualizado quando implementarmos admin

-- Supermercados - todos podem ler, apenas admins podem modificar  
CREATE POLICY "Todos podem visualizar supermercados" ON public.supermercados FOR SELECT USING (true);
CREATE POLICY "Apenas admins podem gerenciar supermercados" ON public.supermercados FOR ALL USING (false); -- Será atualizado quando implementarmos admin

-- Produtos - todos podem ler, apenas admins podem modificar
CREATE POLICY "Todos podem visualizar produtos" ON public.produtos FOR SELECT USING (true);
CREATE POLICY "Apenas admins podem gerenciar produtos" ON public.produtos FOR ALL USING (false); -- Será atualizado quando implementarmos admin

-- Compras - usuários só podem ver suas próprias compras
CREATE POLICY "Usuários podem visualizar suas compras" ON public.compras FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem criar suas compras" ON public.compras FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários podem atualizar suas compras" ON public.compras FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem deletar suas compras" ON public.compras FOR DELETE USING (auth.uid() = user_id);

-- Itens de compra - usuários só podem ver itens de suas compras
CREATE POLICY "Usuários podem visualizar itens de suas compras" ON public.itens_compra FOR SELECT 
    USING (EXISTS (SELECT 1 FROM public.compras WHERE id = compra_id AND user_id = auth.uid()));

CREATE POLICY "Usuários podem inserir itens em suas compras" ON public.itens_compra FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM public.compras WHERE id = compra_id AND user_id = auth.uid()));

CREATE POLICY "Usuários podem atualizar itens de suas compras" ON public.itens_compra FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM public.compras WHERE id = compra_id AND user_id = auth.uid()));

CREATE POLICY "Usuários podem deletar itens de suas compras" ON public.itens_compra FOR DELETE 
    USING (EXISTS (SELECT 1 FROM public.compras WHERE id = compra_id AND user_id = auth.uid()));

-- Histórico de preços - todos podem visualizar para análises
CREATE POLICY "Todos podem visualizar histórico de preços" ON public.historico_precos FOR SELECT USING (true);
CREATE POLICY "Sistema pode inserir histórico de preços" ON public.historico_precos FOR INSERT WITH CHECK (true);

-- INSERIR DADOS INICIAIS

-- Categorias básicas
INSERT INTO public.categorias (nome, descricao, icone, cor) VALUES
('Alimentos', 'Produtos alimentícios em geral', 'utensils', '#FF6B35'),
('Bebidas', 'Bebidas alcoólicas e não alcoólicas', 'coffee', '#4ECDC4'),
('Higiene Pessoal', 'Produtos de higiene e cuidados pessoais', 'heart', '#45B7D1'),
('Limpeza', 'Produtos de limpeza doméstica', 'home', '#96CEB4'),
('Frios e Laticínios', 'Frios, queijos, leites e derivados', 'snowflake', '#FFEAA7'),
('Carnes', 'Carnes bovinas, suínas, aves e peixes', 'beef', '#FD79A8'),
('Frutas e Verduras', 'Hortifrúti em geral', 'apple', '#00B894'),
('Padaria', 'Pães, bolos e produtos de padaria', 'bread-slice', '#F39C12'),
('Congelados', 'Produtos congelados', 'thermometer', '#74B9FF'),
('Pet Shop', 'Produtos para animais de estimação', 'paw', '#A29BFE'),
('Farmácia', 'Medicamentos e produtos farmacêuticos', 'pills', '#FD79A8'),
('Outros', 'Produtos diversos', 'package', '#636E72');

-- Supermercados exemplo (alguns dados ficcionais para teste)
INSERT INTO public.supermercados (nome, cnpj, cidade, estado) VALUES
('Carrefour', '45543915000181', 'São Paulo', 'SP'),
('Pão de Açúcar', '47508411000156', 'Rio de Janeiro', 'RJ'),
('Extra', '47508411000237', 'Belo Horizonte', 'MG'),
('Walmart', '05570714000159', 'Brasília', 'DF'),
('Atacadão', '75315333000109', 'Salvador', 'BA');

-- VIEWS para relatórios (facilitam consultas futuras)

-- View para preço médio por produto
CREATE VIEW public.view_preco_medio_produto AS
SELECT 
    p.id as produto_id,
    p.nome as produto_nome,
    c.nome as categoria_nome,
    AVG(ic.preco_unitario) as preco_medio,
    COUNT(ic.id) as total_compras,
    MIN(ic.preco_unitario) as menor_preco,
    MAX(ic.preco_unitario) as maior_preco
FROM public.produtos p
JOIN public.categorias c ON p.categoria_id = c.id
JOIN public.itens_compra ic ON p.id = ic.produto_id
GROUP BY p.id, p.nome, c.nome;

-- View para gastos por categoria
CREATE VIEW public.view_gastos_categoria AS
SELECT 
    cat.id as categoria_id,
    cat.nome as categoria_nome,
    SUM(ic.preco_total) as total_gasto,
    AVG(ic.preco_total) as gasto_medio,
    COUNT(ic.id) as total_itens
FROM public.categorias cat
JOIN public.produtos p ON cat.id = p.categoria_id
JOIN public.itens_compra ic ON p.id = ic.produto_id
JOIN public.compras comp ON ic.compra_id = comp.id
GROUP BY cat.id, cat.nome;

-- View para comparação de preços entre supermercados
CREATE VIEW public.view_comparacao_supermercados AS
SELECT 
    p.id as produto_id,
    p.nome as produto_nome,
    s.id as supermercado_id,
    s.nome as supermercado_nome,
    AVG(ic.preco_unitario) as preco_medio,
    COUNT(ic.id) as vezes_comprado,
    MAX(comp.data_compra) as ultima_compra
FROM public.produtos p
JOIN public.itens_compra ic ON p.id = ic.produto_id
JOIN public.compras comp ON ic.compra_id = comp.id
JOIN public.supermercados s ON comp.supermercado_id = s.id
GROUP BY p.id, p.nome, s.id, s.nome;

COMMENT ON TABLE public.categorias IS 'Categorias de produtos do supermercado';
COMMENT ON TABLE public.supermercados IS 'Cadastro de supermercados e estabelecimentos';
COMMENT ON TABLE public.produtos IS 'Cadastro de produtos disponíveis';
COMMENT ON TABLE public.compras IS 'Registro de compras realizadas pelos usuários';
COMMENT ON TABLE public.itens_compra IS 'Itens individuais de cada compra';
COMMENT ON TABLE public.historico_precos IS 'Histórico de preços para análises de tendência';