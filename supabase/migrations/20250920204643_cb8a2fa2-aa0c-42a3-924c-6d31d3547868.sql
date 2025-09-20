-- LIMPEZA TOTAL DO ESTOQUE - ZERAR TUDO PARA COMEÇAR DO ZERO
DELETE FROM estoque_app;
DELETE FROM precos_atuais_usuario;
DELETE FROM precos_atuais;

-- Resetar todas as notas como não processadas para permitir reprocessamento
UPDATE notas_imagens SET processada = false WHERE processada = true;