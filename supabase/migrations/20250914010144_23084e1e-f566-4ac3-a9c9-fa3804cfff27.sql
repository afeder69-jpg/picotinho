-- Inserir o produto SUCO AURORA que está faltando na versão do estoque
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'SUCO AURORA 1, UVA TINTO TP',
  19.99,
  '45543915025176', -- CNPJ do estabelecimento
  'COSTAZUL ALIMENTOS LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;

-- Garantir que a versão com vírgula também funcione para normalização
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'SUCO AURORA 1 UVA TINTO TP',
  19.99,
  '45543915025176',
  'COSTAZUL ALIMENTOS LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;