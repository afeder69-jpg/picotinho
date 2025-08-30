-- Verificar estrutura da tabela supermercados para ver o limite do campo cnpj
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'supermercados' AND column_name = 'cnpj';