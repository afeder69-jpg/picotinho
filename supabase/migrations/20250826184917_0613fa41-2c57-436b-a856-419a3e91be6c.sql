-- Criação do banco completo para Notinha - trabalhando com estrutura existente

-- 1. Tabela de Supermercados
CREATE TABLE IF NOT EXISTS public.supermercados (
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

-- 2. Ajustar tabela de categorias existente (adicionar campos opcionais)
ALTER TABLE public.categorias ADD COLUMN IF NOT EXISTS icone VARCHAR(50);
ALTER TABLE public.categorias ADD COLUMN IF NOT EXISTS cor VARCHAR(7);
ALTER TABLE public.categorias ADD COLUMN IF NOT EXISTS ativa BOOLEAN DEFAULT true;

-- 3. Tabela de Produtos
CREATE TABLE IF NOT EXISTS public.produtos_app (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    categoria_id UUID NOT NULL REFERENCES public.categorias(id) ON DELETE RESTRICT,
    marca VARCHAR(100),
    unidade_medida VARCHAR(20) NOT NULL DEFAULT 'unidade',
    codigo_barras VARCHAR(50),
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Tabela de Compras
CREATE TABLE IF NOT EXISTS public.compras_app (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    supermercado_id UUID NOT NULL REFERENCES public.supermercados(id) ON DELETE RESTRICT,
    data_compra DATE NOT NULL,
    hora_compra TIME,
    preco_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    desconto NUMERIC(10,2) DEFAULT 0.00,
    taxa_servico NUMERIC(10,2) DEFAULT 0.00,
    forma_pagamento VARCHAR(50),
    qr_code_url TEXT,
    numero_nota_fiscal VARCHAR(100),
    chave_acesso VARCHAR(44),
    status VARCHAR(20) DEFAULT 'processada',
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Tabela de Itens da Compra
CREATE TABLE IF NOT EXISTS public.itens_compra_app (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id UUID NOT NULL REFERENCES public.compras_app(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos_app(id) ON DELETE RESTRICT,
    quantidade NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
    preco_total NUMERIC(10,2) NOT NULL CHECK (preco_total >= 0),
    desconto_item NUMERIC(10,2) DEFAULT 0.00,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. Tabela de Histórico de Preços
CREATE TABLE IF NOT EXISTS public.historico_precos_app (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id UUID NOT NULL REFERENCES public.produtos_app(id) ON DELETE CASCADE,
    supermercado_id UUID NOT NULL REFERENCES public.supermercados(id) ON DELETE CASCADE,
    preco NUMERIC(10,2) NOT NULL,
    data_preco DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ÍNDICES para performance
CREATE INDEX IF NOT EXISTS idx_produtos_app_categoria ON public.produtos_app(categoria_id);
CREATE INDEX IF NOT EXISTS idx_produtos_app_nome ON public.produtos_app(nome);
CREATE INDEX IF NOT EXISTS idx_produtos_app_codigo_barras ON public.produtos_app(codigo_barras);
CREATE INDEX IF NOT EXISTS idx_compras_app_user_id ON public.compras_app(user_id);
CREATE INDEX IF NOT EXISTS idx_compras_app_supermercado ON public.compras_app(supermercado_id);
CREATE INDEX IF NOT EXISTS idx_compras_app_data ON public.compras_app(data_compra);
CREATE INDEX IF NOT EXISTS idx_itens_compra_app_compra_id ON public.itens_compra_app(compra_id);
CREATE INDEX IF NOT EXISTS idx_itens_compra_app_produto_id ON public.itens_compra_app(produto_id);
CREATE INDEX IF NOT EXISTS idx_historico_precos_app_produto ON public.historico_precos_app(produto_id, supermercado_id, data_preco);

-- TRIGGERS para cálculos automáticos

-- Trigger para calcular preco_total em itens_compra_app
CREATE OR REPLACE FUNCTION public.calculate_item_total_app()
RETURNS TRIGGER AS $$
BEGIN
    NEW.preco_total = (NEW.quantidade * NEW.preco_unitario) - COALESCE(NEW.desconto_item, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_itens_compra_app_total ON public.itens_compra_app;
CREATE TRIGGER calculate_itens_compra_app_total
    BEFORE INSERT OR UPDATE ON public.itens_compra_app
    FOR EACH ROW EXECUTE FUNCTION public.calculate_item_total_app();

-- Trigger para atualizar o total da compra quando itens são modificados
CREATE OR REPLACE FUNCTION public.update_compra_total_app()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.compras_app 
    SET preco_total = (
        SELECT COALESCE(SUM(preco_total), 0) 
        FROM public.itens_compra_app 
        WHERE compra_id = COALESCE(NEW.compra_id, OLD.compra_id)
    )
    WHERE id = COALESCE(NEW.compra_id, OLD.compra_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_compra_total_app_on_item_change ON public.itens_compra_app;
CREATE TRIGGER update_compra_total_app_on_item_change
    AFTER INSERT OR UPDATE OR DELETE ON public.itens_compra_app
    FOR EACH ROW EXECUTE FUNCTION public.update_compra_total_app();

-- Trigger para inserir no histórico de preços
CREATE OR REPLACE FUNCTION public.insert_historico_precos_app()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.historico_precos_app (produto_id, supermercado_id, preco, data_preco)
    SELECT 
        NEW.produto_id,
        c.supermercado_id,
        NEW.preco_unitario,
        c.data_compra
    FROM public.compras_app c
    WHERE c.id = NEW.compra_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS insert_historico_precos_app_trigger ON public.itens_compra_app;
CREATE TRIGGER insert_historico_precos_app_trigger
    AFTER INSERT ON public.itens_compra_app
    FOR EACH ROW EXECUTE FUNCTION public.insert_historico_precos_app();

-- Aplicar trigger de updated_at nas novas tabelas
DROP TRIGGER IF EXISTS update_supermercados_updated_at ON public.supermercados;
CREATE TRIGGER update_supermercados_updated_at BEFORE UPDATE ON public.supermercados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_produtos_app_updated_at ON public.produtos_app;
CREATE TRIGGER update_produtos_app_updated_at BEFORE UPDATE ON public.produtos_app FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_compras_app_updated_at ON public.compras_app;
CREATE TRIGGER update_compras_app_updated_at BEFORE UPDATE ON public.compras_app FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- HABILITAR RLS em todas as tabelas
ALTER TABLE public.supermercados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_compra_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_precos_app ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS

-- Supermercados - todos podem ler
DROP POLICY IF EXISTS "Todos podem visualizar supermercados" ON public.supermercados;
CREATE POLICY "Todos podem visualizar supermercados" ON public.supermercados FOR SELECT USING (true);

-- Produtos - todos podem ler
DROP POLICY IF EXISTS "Todos podem visualizar produtos" ON public.produtos_app;
CREATE POLICY "Todos podem visualizar produtos" ON public.produtos_app FOR SELECT USING (true);

-- Compras - usuários só podem ver suas próprias compras
DROP POLICY IF EXISTS "Usuários podem visualizar suas compras" ON public.compras_app;
CREATE POLICY "Usuários podem visualizar suas compras" ON public.compras_app FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar suas compras" ON public.compras_app;
CREATE POLICY "Usuários podem criar suas compras" ON public.compras_app FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas compras" ON public.compras_app;
CREATE POLICY "Usuários podem atualizar suas compras" ON public.compras_app FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar suas compras" ON public.compras_app;
CREATE POLICY "Usuários podem deletar suas compras" ON public.compras_app FOR DELETE USING (auth.uid() = user_id);

-- Itens de compra - usuários só podem ver itens de suas compras
DROP POLICY IF EXISTS "Usuários podem visualizar itens de suas compras" ON public.itens_compra_app;
CREATE POLICY "Usuários podem visualizar itens de suas compras" ON public.itens_compra_app FOR SELECT 
    USING (EXISTS (SELECT 1 FROM public.compras_app WHERE id = compra_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Usuários podem inserir itens em suas compras" ON public.itens_compra_app;
CREATE POLICY "Usuários podem inserir itens em suas compras" ON public.itens_compra_app FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM public.compras_app WHERE id = compra_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Usuários podem atualizar itens de suas compras" ON public.itens_compra_app;
CREATE POLICY "Usuários podem atualizar itens de suas compras" ON public.itens_compra_app FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM public.compras_app WHERE id = compra_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Usuários podem deletar itens de suas compras" ON public.itens_compra_app;
CREATE POLICY "Usuários podem deletar itens de suas compras" ON public.itens_compra_app FOR DELETE 
    USING (EXISTS (SELECT 1 FROM public.compras_app WHERE id = compra_id AND user_id = auth.uid()));

-- Histórico de preços - todos podem visualizar
DROP POLICY IF EXISTS "Todos podem visualizar histórico de preços" ON public.historico_precos_app;
CREATE POLICY "Todos podem visualizar histórico de preços" ON public.historico_precos_app FOR SELECT USING (true);

DROP POLICY IF EXISTS "Sistema pode inserir histórico de preços" ON public.historico_precos_app;
CREATE POLICY "Sistema pode inserir histórico de preços" ON public.historico_precos_app FOR INSERT WITH CHECK (true);

-- INSERIR DADOS INICIAIS

-- Supermercados exemplo
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.supermercados LIMIT 1) THEN
        INSERT INTO public.supermercados (nome, cnpj, cidade, estado) VALUES
        ('Carrefour', '45543915000181', 'São Paulo', 'SP'),
        ('Pão de Açúcar', '47508411000156', 'Rio de Janeiro', 'RJ'),
        ('Extra', '47508411000237', 'Belo Horizonte', 'MG'),
        ('Walmart', '05570714000159', 'Brasília', 'DF'),
        ('Atacadão', '75315333000109', 'Salvador', 'BA');
    END IF;
END
$$;

-- Criar um usuário sistema para inserir categorias se necessário
-- (supondo que existe um usuário com ID específico ou criamos categorias globais)

-- VIEWS para relatórios
CREATE OR REPLACE VIEW public.view_preco_medio_produto_app AS
SELECT 
    p.id as produto_id,
    p.nome as produto_nome,
    c.nome as categoria_nome,
    AVG(ic.preco_unitario) as preco_medio,
    COUNT(ic.id) as total_compras,
    MIN(ic.preco_unitario) as menor_preco,
    MAX(ic.preco_unitario) as maior_preco
FROM public.produtos_app p
JOIN public.categorias c ON p.categoria_id = c.id
JOIN public.itens_compra_app ic ON p.id = ic.produto_id
GROUP BY p.id, p.nome, c.nome;

-- View para gastos por categoria
CREATE OR REPLACE VIEW public.view_gastos_categoria_app AS
SELECT 
    cat.id as categoria_id,
    cat.nome as categoria_nome,
    SUM(ic.preco_total) as total_gasto,
    AVG(ic.preco_total) as gasto_medio,
    COUNT(ic.id) as total_itens
FROM public.categorias cat
JOIN public.produtos_app p ON cat.id = p.categoria_id
JOIN public.itens_compra_app ic ON p.id = ic.produto_id
JOIN public.compras_app comp ON ic.compra_id = comp.id
GROUP BY cat.id, cat.nome;

-- View para comparação de preços entre supermercados
CREATE OR REPLACE VIEW public.view_comparacao_supermercados_app AS
SELECT 
    p.id as produto_id,
    p.nome as produto_nome,
    s.id as supermercado_id,
    s.nome as supermercado_nome,
    AVG(ic.preco_unitario) as preco_medio,
    COUNT(ic.id) as vezes_comprado,
    MAX(comp.data_compra) as ultima_compra
FROM public.produtos_app p
JOIN public.itens_compra_app ic ON p.id = ic.produto_id
JOIN public.compras_app comp ON ic.compra_id = comp.id
JOIN public.supermercados s ON comp.supermercado_id = s.id
GROUP BY p.id, p.nome, s.id, s.nome;

-- Comentários nas tabelas
COMMENT ON TABLE public.supermercados IS 'Cadastro de supermercados e estabelecimentos';
COMMENT ON TABLE public.produtos_app IS 'Cadastro de produtos disponíveis no app';
COMMENT ON TABLE public.compras_app IS 'Registro de compras realizadas pelos usuários';
COMMENT ON TABLE public.itens_compra_app IS 'Itens individuais de cada compra';
COMMENT ON TABLE public.historico_precos_app IS 'Histórico de preços para análises de tendência';