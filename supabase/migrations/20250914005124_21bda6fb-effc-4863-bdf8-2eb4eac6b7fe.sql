-- CORREÇÃO DEFINITIVA: Atualizar TODOS os registros que contêm "IOG"
-- Primeiro, atualizar no estoque com UPDATE direto e específico
UPDATE estoque_app 
SET produto_nome = CASE 
  WHEN produto_nome = 'IOG LACFREE TRADICIONAL' THEN 'IOGURTE LACFREE TRADICIONAL'
  WHEN produto_nome = 'IOG LIQUIDO LACFREE MORANGO' THEN 'IOGURTE LIQUIDO LACFREE MORANGO'
  WHEN produto_nome = 'IOG LÍQUIDO LACFREE MORANGO' THEN 'IOGURTE LÍQUIDO LACFREE MORANGO'
  ELSE REPLACE(REPLACE(produto_nome, 'IOG ', 'IOGURTE '), 'IOG LACFREE', 'IOGURTE LACFREE')
END,
updated_at = now()
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
AND UPPER(produto_nome) LIKE '%IOG%';

-- Inserir/atualizar na tabela precos_atuais com nomes corretos
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES 
  ('IOGURTE LACFREE TRADICIONAL', 3.36, '45543915000581', 'CARREFOUR COMERCIO E INDUSTRIA LTDA', now()),
  ('IOGURTE LIQUIDO LACFREE MORANGO', 3.44, '45543915000581', 'CARREFOUR COMERCIO E INDUSTRIA LTDA', now()),
  ('IOGURTE LÍQUIDO LACFREE MORANGO', 3.44, '45543915000581', 'CARREFOUR COMERCIO E INDUSTRIA LTDA', now())
ON CONFLICT (produto_nome, estabelecimento_cnpj) 
DO UPDATE SET
  valor_unitario = EXCLUDED.valor_unitario,
  data_atualizacao = EXCLUDED.data_atualizacao;

-- Garantir que a normalização está correta e ativa
DELETE FROM normalizacoes_nomes WHERE termo_errado LIKE '%IOG%';

INSERT INTO normalizacoes_nomes (termo_errado, termo_correto, ativo) 
VALUES 
  ('IOG', 'IOGURTE', true),
  ('IOG LACFREE', 'IOGURTE LACFREE', true),
  ('IOG LIQUIDO', 'IOGURTE LIQUIDO', true),
  ('IOG LÍQUIDO', 'IOGURTE LÍQUIDO', true)
ON CONFLICT (termo_errado) 
DO UPDATE SET termo_correto = EXCLUDED.termo_correto, ativo = true;