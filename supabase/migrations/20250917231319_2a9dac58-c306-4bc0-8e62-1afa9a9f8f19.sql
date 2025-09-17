-- Limpar TODOS os dados residuais das datas de teste 10-13/09
DELETE FROM precos_atuais 
WHERE data_atualizacao::date BETWEEN '2025-09-10' AND '2025-09-13';

-- Também limpar na tabela do usuário
DELETE FROM precos_atuais_usuario 
WHERE data_atualizacao::date BETWEEN '2025-09-10' AND '2025-09-13';