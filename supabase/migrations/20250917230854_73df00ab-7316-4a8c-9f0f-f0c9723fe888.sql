-- Remover todos os dados residuais com data 11/09/2025 da tabela precos_atuais
DELETE FROM precos_atuais 
WHERE data_atualizacao::date = '2025-09-11';

-- Remover dados residuais da tabela precos_atuais_usuario também
DELETE FROM precos_atuais_usuario 
WHERE data_atualizacao::date = '2025-09-11';