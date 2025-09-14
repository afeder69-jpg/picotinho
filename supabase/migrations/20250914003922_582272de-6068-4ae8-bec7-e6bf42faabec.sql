-- Padronizar nome do estabelecimento na tabela precos_atuais
UPDATE precos_atuais 
SET estabelecimento_nome = 'COSTAZUL ALIMENTOS LTDA'
WHERE estabelecimento_cnpj = '17493338000397' 
AND estabelecimento_nome = 'COSTAZUL';

-- Garantir que nosso produto específico existe com o nome correto
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'SABÃO EM PÓ SURF EXPLOSÃO DE FLORES',
  9.39,
  '17493338000397',
  'COSTAZUL ALIMENTOS LTDA',
  now()
) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  estabelecimento_nome = EXCLUDED.estabelecimento_nome,
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;