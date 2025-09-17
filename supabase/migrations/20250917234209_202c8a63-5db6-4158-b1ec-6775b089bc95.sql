-- REMOVER TODOS OS PREÇOS RESIDUAIS NÃO NORMALIZADOS DO COSTAZUL
-- Estes produtos foram processados antes da IA e não têm normalização
-- Podem causar conflitos futuros com produtos normalizados pela IA-2
DELETE FROM precos_atuais 
WHERE estabelecimento_cnpj = '17493338000397'
AND produto_nome_normalizado IS NULL
AND nome_base IS NULL 
AND produto_hash_normalizado IS NULL;