-- ========================================
-- CORREÇÃO: Preços Atuais - user_id e Duplicatas Semânticas
-- ========================================

-- PARTE 1: Deletar todos os registros com user_id = NULL (dados incorretos)
DELETE FROM precos_atuais WHERE user_id IS NULL;

-- PARTE 2: Adicionar constraint NOT NULL no user_id
ALTER TABLE precos_atuais 
ALTER COLUMN user_id SET NOT NULL;

-- PARTE 3: Dropar a constraint antiga e criar nova com user_id
-- (permitir mesmo produto/CNPJ para usuários diferentes)
ALTER TABLE precos_atuais 
DROP CONSTRAINT IF EXISTS precos_atuais_produto_nome_estabelecimento_cnpj_key;

CREATE UNIQUE INDEX precos_atuais_unique_per_user
ON precos_atuais(user_id, produto_nome, estabelecimento_cnpj);

-- PARTE 4: Comentar a mudança
COMMENT ON INDEX precos_atuais_unique_per_user IS 
'Garante unicidade por (usuário + produto + estabelecimento), permitindo que cada usuário tenha seus próprios preços atuais. Produto nome é normalizado pela edge function antes do insert.';