-- Inserir o produto BEB CAP DOC L SLAC 3CORACOES WHEY que está faltando
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'BEB CAP DOC L SLAC 3CORACOES WHEY',
  6.92,
  '45543915025176', -- CNPJ do Carrefour
  'CARREFOUR COMERCIO E INDUSTRIA LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;

-- Também inserir uma versão mais completa
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'BEBIDA CAP DOC LITROS SLAC 3CORACOES WHEY',
  6.92,
  '45543915025176',
  'CARREFOUR COMERCIO E INDUSTRIA LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;