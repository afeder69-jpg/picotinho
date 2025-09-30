-- Padronizar unidades de medida no padrão Picotinho (Un, Kg, Lt)

-- 1. Atualizar tabela estoque_app
UPDATE estoque_app 
SET unidade_medida = CASE 
  WHEN UPPER(TRIM(unidade_medida)) IN ('PC', 'UNIDADE', 'UN', 'UND', 'PEÇA', 'PECA') THEN 'Un'
  WHEN UPPER(TRIM(unidade_medida)) IN ('G', 'GRAMAS', 'GRAMA', 'KG', 'QUILO', 'KILO') THEN 'Kg'
  WHEN UPPER(TRIM(unidade_medida)) IN ('ML', 'MILILITRO', 'MILILITROS', 'L', 'LT', 'LITRO', 'LITROS') THEN 'Lt'
  ELSE unidade_medida
END
WHERE UPPER(TRIM(unidade_medida)) IN ('PC', 'UNIDADE', 'UN', 'UND', 'PEÇA', 'PECA', 'G', 'GRAMAS', 'GRAMA', 'KG', 'QUILO', 'KILO', 'ML', 'MILILITRO', 'MILILITROS', 'L', 'LT', 'LITRO', 'LITROS');

-- 2. Atualizar tabela itens_nota
UPDATE itens_nota 
SET unidade = CASE 
  WHEN UPPER(TRIM(unidade)) IN ('PC', 'UNIDADE', 'UN', 'UND', 'PEÇA', 'PECA') THEN 'Un'
  WHEN UPPER(TRIM(unidade)) IN ('G', 'GRAMAS', 'GRAMA', 'KG', 'QUILO', 'KILO') THEN 'Kg'
  WHEN UPPER(TRIM(unidade)) IN ('ML', 'MILILITRO', 'MILILITROS', 'L', 'LT', 'LITRO', 'LITROS') THEN 'Lt'
  ELSE unidade
END
WHERE UPPER(TRIM(unidade)) IN ('PC', 'UNIDADE', 'UN', 'UND', 'PEÇA', 'PECA', 'G', 'GRAMAS', 'GRAMA', 'KG', 'QUILO', 'KILO', 'ML', 'MILILITRO', 'MILILITROS', 'L', 'LT', 'LITRO', 'LITROS');

-- 3. Atualizar tabela produtos_app
UPDATE produtos_app 
SET unidade_medida = CASE 
  WHEN UPPER(TRIM(unidade_medida)) IN ('PC', 'UNIDADE', 'UN', 'UND', 'PEÇA', 'PECA') THEN 'Un'
  WHEN UPPER(TRIM(unidade_medida)) IN ('G', 'GRAMAS', 'GRAMA', 'KG', 'QUILO', 'KILO') THEN 'Kg'
  WHEN UPPER(TRIM(unidade_medida)) IN ('ML', 'MILILITRO', 'MILILITROS', 'L', 'LT', 'LITRO', 'LITROS') THEN 'Lt'
  ELSE unidade_medida
END
WHERE UPPER(TRIM(unidade_medida)) IN ('PC', 'UNIDADE', 'UN', 'UND', 'PEÇA', 'PECA', 'G', 'GRAMAS', 'GRAMA', 'KG', 'QUILO', 'KILO', 'ML', 'MILILITRO', 'MILILITROS', 'L', 'LT', 'LITRO', 'LITROS');

-- 4. Atualizar tabela produtos_normalizados
UPDATE produtos_normalizados 
SET unidade_medida = CASE 
  WHEN UPPER(TRIM(unidade_medida)) IN ('PC', 'UNIDADE', 'UN', 'UND', 'PEÇA', 'PECA') THEN 'Un'
  WHEN UPPER(TRIM(unidade_medida)) IN ('G', 'GRAMAS', 'GRAMA', 'KG', 'QUILO', 'KILO') THEN 'Kg'
  WHEN UPPER(TRIM(unidade_medida)) IN ('ML', 'MILILITRO', 'MILILITROS', 'L', 'LT', 'LITRO', 'LITROS') THEN 'Lt'
  ELSE unidade_medida
END
WHERE UPPER(TRIM(unidade_medida)) IN ('PC', 'UNIDADE', 'UN', 'UND', 'PEÇA', 'PECA', 'G', 'GRAMAS', 'GRAMA', 'KG', 'QUILO', 'KILO', 'ML', 'MILILITRO', 'MILILITROS', 'L', 'LT', 'LITRO', 'LITROS');