-- Remover dados residuais do SUPERDELLI que não correspondem a notas fiscais do usuário
DELETE FROM precos_atuais 
WHERE estabelecimento_nome = 'SUPERDELLI ATACADO E SUPERMERCADOS SA' 
AND data_atualizacao::date = '2025-09-11';