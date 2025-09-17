-- Limpar dados residuais de teste das datas 10-13/09
DELETE FROM precos_atuais 
WHERE data_atualizacao::date BETWEEN '2025-09-10' AND '2025-09-13'
AND estabelecimento_nome LIKE '%COSTAZUL%';