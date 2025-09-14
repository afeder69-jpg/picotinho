-- Atualizar TODOS os produtos que contêm "IOG" no estoque para "IOGURTE"
UPDATE estoque_app 
SET produto_nome = REGEXP_REPLACE(produto_nome, '\bIOG\b', 'IOGURTE', 'gi'),
    updated_at = now()
WHERE UPPER(produto_nome) LIKE '%IOG%'
AND user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- Atualizar TODOS os produtos que contêm "IOG" na tabela precos_atuais
UPDATE precos_atuais 
SET produto_nome = REGEXP_REPLACE(produto_nome, '\bIOG\b', 'IOGURTE', 'gi')
WHERE UPPER(produto_nome) LIKE '%IOG%';

-- Inserir/atualizar especificamente os produtos que o usuário mencionou
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES 
  ('IOGURTE LACFREE TRADICIONAL', 3.36, '45543915000581', 'CARREFOUR COMERCIO E INDUSTRIA LTDA', now()),
  ('IOGURTE LIQUIDO LACFREE MORANGO', 3.44, '45543915000581', 'CARREFOUR COMERCIO E INDUSTRIA LTDA', now())
ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;

-- Atualizar também a normalização para ser mais abrangente
UPDATE normalizacoes_nomes 
SET termo_errado = 'IOG', termo_correto = 'IOGURTE', ativo = true
WHERE termo_errado = 'IOG';

-- Adicionar mais regras de normalização se necessário
INSERT INTO normalizacoes_nomes (termo_errado, termo_correto, ativo) 
VALUES 
  ('IOG LACFREE', 'IOGURTE LACFREE', true),
  ('IOG LIQUIDO', 'IOGURTE LIQUIDO', true),
  ('IOG LÍQUIDO', 'IOGURTE LÍQUIDO', true)
ON CONFLICT (termo_errado) 
DO UPDATE SET termo_correto = EXCLUDED.termo_correto, ativo = true;