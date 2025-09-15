-- Adicionar campos de normalização na tabela estoque_app
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS produto_nome_normalizado TEXT;
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS nome_base TEXT;
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS tipo_embalagem TEXT;
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS qtd_valor NUMERIC;
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS qtd_unidade TEXT;
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS qtd_base NUMERIC;
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS granel BOOLEAN DEFAULT FALSE;
ALTER TABLE estoque_app ADD COLUMN IF NOT EXISTS produto_hash_normalizado TEXT;

-- Adicionar campos de normalização na tabela precos_atuais
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS produto_nome_normalizado TEXT;
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS nome_base TEXT;
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS tipo_embalagem TEXT;
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS qtd_valor NUMERIC;
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS qtd_unidade TEXT;
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS qtd_base NUMERIC;
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS granel BOOLEAN DEFAULT FALSE;
ALTER TABLE precos_atuais ADD COLUMN IF NOT EXISTS produto_hash_normalizado TEXT;

-- Adicionar campos de normalização na tabela precos_atuais_usuario
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS produto_nome_normalizado TEXT;
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS nome_base TEXT;
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS tipo_embalagem TEXT;
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS qtd_valor NUMERIC;
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS qtd_unidade TEXT;
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS qtd_base NUMERIC;
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS granel BOOLEAN DEFAULT FALSE;
ALTER TABLE precos_atuais_usuario ADD COLUMN IF NOT EXISTS produto_hash_normalizado TEXT;

-- Criar tabela de normalizações de produtos para back-office
CREATE TABLE IF NOT EXISTS normalizacoes_produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_original TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de normalizações de marcas para back-office
CREATE TABLE IF NOT EXISTS normalizacoes_marcas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_original TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de normalizações de embalagens para back-office
CREATE TABLE IF NOT EXISTS normalizacoes_embalagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_original TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de marcas conhecidas
CREATE TABLE IF NOT EXISTS marcas_conhecidas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inserir marcas conhecidas iniciais
INSERT INTO marcas_conhecidas (nome) VALUES 
('SEARA'), ('UNIÃO'), ('OMO'), ('TIDE'), ('NESTLÉ'), ('COCA-COLA'), ('PEPSI'), 
('MAIZENA'), ('YOKI'), ('SADIA'), ('PERDIGÃO'), ('BRF'), ('AURORA'), ('FRIBOI'),
('BAUDUCCO'), ('TRAKINAS'), ('NESCAU'), ('LEITE NINHO'), ('DANONE'), ('ITAMBÉ'),
('PARMALAT'), ('PIRACANJUBA'), ('YPÊ'), ('MINUANO'), ('BOMBRIL'), ('AJAX'),
('VIM'), ('ASSOLAN'), ('COTONETES'), ('GILLETTE'), ('ORAL-B'), ('COLGATE'),
('NIVEA'), ('REXONA'), ('DOVE'), ('PALMOLIVE'), ('JOHNSON'), ('HUGGIES'),
('PAMPERS'), ('SEMPRE LIVRE'), ('INTIMUS'), ('MODESS'), ('NATURA'), ('BOTICÁRIO'),
('MAGGI'), ('KNORR'), ('HELLMANN'), ('KETCHUP HEINZ'), ('MOSTARDA HEMMER'),
('AÇÚCAR CRISTAL'), ('AÇÚCAR UNIÃO'), ('SAL CISNE'), ('ÓLEO SOYA'), ('ÓLEO LIZA'),
('FARINHA DE TRIGO DONA BENTA'), ('MACARRÃO BARILLA'), ('MACARRÃO GALO'),
('ARROZ TIO JOÃO'), ('ARROZ CAMIL'), ('FEIJÃO CAMIL'), ('FEIJÃO KICALDO'),
('CAFÉ PILÃO'), ('CAFÉ MELLITA'), ('CAFÉ TRÊS CORAÇÕES'), ('CHÁ LEÃO')
ON CONFLICT (nome) DO NOTHING;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_estoque_produto_hash ON estoque_app(produto_hash_normalizado);
CREATE INDEX IF NOT EXISTS idx_precos_produto_hash ON precos_atuais(produto_hash_normalizado);
CREATE INDEX IF NOT EXISTS idx_precos_usuario_produto_hash ON precos_atuais_usuario(produto_hash_normalizado);

-- RLS políticas para as novas tabelas
ALTER TABLE normalizacoes_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE normalizacoes_marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE normalizacoes_embalagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas_conhecidas ENABLE ROW LEVEL SECURITY;

-- Políticas para normalizações (apenas sistema pode gerenciar, todos podem ler ativos)
CREATE POLICY "Sistema pode gerenciar normalizações de produtos" ON normalizacoes_produtos
FOR ALL USING (current_setting('role', true) = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY "Todos podem ler normalizações ativas de produtos" ON normalizacoes_produtos
FOR SELECT USING (ativo = true);

CREATE POLICY "Sistema pode gerenciar normalizações de marcas" ON normalizacoes_marcas
FOR ALL USING (current_setting('role', true) = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY "Todos podem ler normalizações ativas de marcas" ON normalizacoes_marcas
FOR SELECT USING (ativo = true);

CREATE POLICY "Sistema pode gerenciar normalizações de embalagens" ON normalizacoes_embalagens
FOR ALL USING (current_setting('role', true) = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY "Todos podem ler normalizações ativas de embalagens" ON normalizacoes_embalagens
FOR SELECT USING (ativo = true);

CREATE POLICY "Todos podem ler marcas conhecidas ativas" ON marcas_conhecidas
FOR SELECT USING (ativo = true);

CREATE POLICY "Sistema pode gerenciar marcas conhecidas" ON marcas_conhecidas
FOR ALL USING (current_setting('role', true) = 'service_role' OR auth.role() = 'authenticated');

-- Função para normalizar produtos usando a nova IA-2
CREATE OR REPLACE FUNCTION normalizar_produto_v1(nome_original TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    resultado jsonb;
BEGIN
    -- Por enquanto retorna estrutura básica, será substituída pela IA-2
    -- Esta função serve como interface padrão para futuras melhorias
    
    resultado := jsonb_build_object(
        'produto_nome_normalizado', UPPER(TRIM(nome_original)),
        'nome_base', UPPER(TRIM(nome_original)),
        'marca', null,
        'tipo_embalagem', null,
        'qtd_valor', null,
        'qtd_unidade', null,
        'qtd_base', null,
        'granel', false,
        'produto_hash_normalizado', encode(sha256(UPPER(TRIM(nome_original))::bytea), 'hex')
    );
    
    RETURN resultado;
END;
$$;