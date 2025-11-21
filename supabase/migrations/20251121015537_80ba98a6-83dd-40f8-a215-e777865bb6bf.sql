-- Criar tabela de regras de recategorização
CREATE TABLE regras_recategorizacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keywords text[] NOT NULL,
  categorias_origem text[],
  categoria_destino text NOT NULL,
  descricao text NOT NULL,
  ativa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE regras_recategorizacao ENABLE ROW LEVEL SECURITY;

-- Política para masters poderem gerenciar todas as regras
CREATE POLICY "Masters podem gerenciar regras de recategorização"
  ON regras_recategorizacao
  FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role));

-- Popular com as 13 regras atuais
INSERT INTO regras_recategorizacao (keywords, categorias_origem, categoria_destino, descricao) VALUES
  (ARRAY['leite condensado', 'condensado'], ARRAY['LATICÍNIOS', 'LATICÍNIOS/FRIOS', 'FRIOS E LATICÍNIOS'], 'MERCEARIA', 'Leite condensado deve ser mercearia'),
  (ARRAY['chocolate garoto', 'chocolate'], ARRAY['LATICÍNIOS', 'LATICÍNIOS/FRIOS', 'FRIOS E LATICÍNIOS', 'OUTROS'], 'MERCEARIA', 'Chocolate deve ser mercearia'),
  (ARRAY['creme de leite', 'creme leite'], ARRAY['LATICÍNIOS', 'LATICÍNIOS/FRIOS', 'FRIOS E LATICÍNIOS'], 'MERCEARIA', 'Creme de leite deve ser mercearia'),
  (ARRAY['manteiga'], ARRAY['LATICÍNIOS', 'LATICÍNIOS/FRIOS', 'FRIOS E LATICÍNIOS', 'OUTROS'], 'PADARIA', 'Manteiga deve ser padaria'),
  (ARRAY['geleia'], ARRAY['OUTROS'], 'MERCEARIA', 'Geleia deve ser mercearia'),
  (ARRAY['gelatina'], ARRAY['OUTROS'], 'MERCEARIA', 'Gelatina deve ser mercearia'),
  (ARRAY['goiabada'], ARRAY['OUTROS'], 'MERCEARIA', 'Goiabada deve ser mercearia'),
  (ARRAY['flocão', 'granfino'], ARRAY['OUTROS'], 'MERCEARIA', 'Flocão deve ser mercearia'),
  (ARRAY['abacate'], ARRAY['OUTROS'], 'HORTIFRUTI', 'Abacate deve ser hortifruti'),
  (ARRAY['mamão formosa', 'mamão'], ARRAY['OUTROS'], 'HORTIFRUTI', 'Mamão deve ser hortifruti'),
  (ARRAY['rúcula', 'rucula'], ARRAY['OUTROS'], 'HORTIFRUTI', 'Rúcula deve ser hortifruti'),
  (ARRAY['chá pronto', 'mate leão', 'chá mate', 'cha pronto', 'cha mate'], ARRAY['OUTROS'], 'BEBIDAS', 'Chá pronto deve ser bebidas'),
  (ARRAY['suco de caixinha', 'suco caixa'], ARRAY['OUTROS'], 'BEBIDAS', 'Suco de caixinha deve ser bebidas');

-- Criar índice para otimizar buscas
CREATE INDEX idx_regras_recategorizacao_ativa ON regras_recategorizacao(ativa) WHERE ativa = true;
CREATE INDEX idx_regras_recategorizacao_categoria_destino ON regras_recategorizacao(categoria_destino);

COMMENT ON TABLE regras_recategorizacao IS 'Regras para recategorização automática de produtos no estoque';