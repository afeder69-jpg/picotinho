-- Verificar todos os limites de caracteres da tabela supermercados
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'supermercados' AND data_type LIKE '%varying%';