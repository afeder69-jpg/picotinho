-- Inserir o produto LEITE COCO RTG COCO DO VALE que está faltando
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'LEITE COCO RTG COCO DO VALE',
  10.21,
  '45543915025176', -- CNPJ do Carrefour
  'CARREFOUR COMERCIO E INDUSTRIA LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;

-- Também inserir a versão mais descritiva que aparece nas notas
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'LEITE DE COCO RTG COCO DO VALE',
  10.21,
  '45543915025176',
  'CARREFOUR COMERCIO E INDUSTRIA LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;