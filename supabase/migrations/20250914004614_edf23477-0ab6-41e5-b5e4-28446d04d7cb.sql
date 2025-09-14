-- Adicionar normalização para IOG -> IOGURTE na tabela de normalizações
INSERT INTO normalizacoes_nomes (termo_errado, termo_correto, ativo) 
VALUES ('IOG', 'IOGURTE', true)
ON CONFLICT (termo_errado) 
DO UPDATE SET termo_correto = EXCLUDED.termo_correto, ativo = true;

-- Atualizar produtos existentes no estoque que começam com IOG
UPDATE estoque_app 
SET produto_nome = REGEXP_REPLACE(produto_nome, '^IOG\b', 'IOGURTE', 'gi'),
    updated_at = now()
WHERE UPPER(produto_nome) LIKE 'IOG %';

-- Atualizar produtos existentes na tabela precos_atuais
UPDATE precos_atuais 
SET produto_nome = REGEXP_REPLACE(produto_nome, '^IOG\b', 'IOGURTE', 'gi')
WHERE UPPER(produto_nome) LIKE 'IOG %';

-- Inserir versões atualizadas dos produtos IOG como IOGURTE
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