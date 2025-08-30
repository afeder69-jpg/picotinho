-- Corrigir constraint da tabela precos_atuais
-- Primeiro, verificar se existe constraint única
ALTER TABLE public.precos_atuais 
DROP CONSTRAINT IF EXISTS precos_atuais_produto_nome_estabelecimento_cnpj_key;

-- Criar constraint única correta
ALTER TABLE public.precos_atuais 
ADD CONSTRAINT precos_atuais_produto_nome_estabelecimento_cnpj_key 
UNIQUE (produto_nome, estabelecimento_cnpj);