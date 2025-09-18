-- Limpeza completa dos dados do usuário autenticado
-- Limpar estoque
DELETE FROM estoque_app WHERE user_id = auth.uid();

-- Limpar notas de imagens
DELETE FROM notas_imagens WHERE usuario_id = auth.uid();

-- Limpar preços atuais do usuário
DELETE FROM precos_atuais_usuario WHERE user_id = auth.uid();

-- Limpar outras tabelas relacionadas
DELETE FROM notas WHERE user_id = auth.uid();
DELETE FROM notas_fiscais WHERE user_id = auth.uid();
DELETE FROM receipts WHERE user_id = auth.uid();

-- Limpar itens de nota
DELETE FROM itens_nota WHERE nota_id IN (
  SELECT id FROM notas_fiscais WHERE user_id = auth.uid()
);

-- Limpar produtos
DELETE FROM produtos WHERE user_id = auth.uid();