-- Inserir o produto IOG LACFREE TRADICIONAL que está faltando na tabela precos_atuais
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'IOG LACFREE TRADICIONAL',
  3.36,
  '45543915000581', -- CNPJ do Carrefour
  'CARREFOUR COMERCIO E INDUSTRIA LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;

-- Também inserir a versão mais descritiva que pode aparecer nas notas
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'IOGURTE LACFREE TRADICIONAL',
  3.36,
  '45543915000581',
  'CARREFOUR COMERCIO E INDUSTRIA LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;