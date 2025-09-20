-- 🧹 LIMPEZA COMPLETA DO BANCO DE DADOS
-- Removendo todos os registros de dados de usuário (produtos, notas, estoque)
-- APROVADO PELO USUÁRIO: 359 registros serão eliminados

-- 1. Limpar estoque (281 registros)
DELETE FROM estoque_app;

-- 2. Limpar notas fiscais (78 registros)  
DELETE FROM notas_fiscais;

-- 3. Limpar notas de imagens (0 registros)
DELETE FROM notas_imagens;

-- 4. Limpar notas antigas (0 registros)
DELETE FROM notas;

-- 5. Limpar receipts (0 registros)
DELETE FROM receipts;

-- 6. Limpar preços de usuários (0 registros)
DELETE FROM precos_atuais_usuario;

-- 7. Limpar itens relacionados
DELETE FROM receipt_items;
DELETE FROM itens_nota;

-- Log da operação
SELECT 'LIMPEZA COMPLETA EXECUTADA - Banco zerado para teste da IA-2' as resultado;