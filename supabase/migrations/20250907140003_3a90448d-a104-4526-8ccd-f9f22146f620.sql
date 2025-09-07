-- Inserir especificamente o produto CEBOLA ROXA KG GRANEL na tabela precos_atuais
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_nome, 
  estabelecimento_cnpj,
  data_atualizacao
) VALUES (
  'CEBOLA ROXA KG GRANEL',
  6.99,
  'COSTAZUL ALIMENTOS LTDA',
  '17493338000397',
  '2025-08-25 15:13:00'
)
ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;