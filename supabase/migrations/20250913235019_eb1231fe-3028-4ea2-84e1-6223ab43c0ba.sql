-- Normalizar categorias existentes para as 11 categorias padrão
UPDATE estoque_app 
SET categoria = CASE 
    WHEN UPPER(categoria) IN ('CARNES', 'CARNE', 'AÇOUGUE') THEN 'açougue'
    WHEN UPPER(categoria) IN ('LATICÍNIOS', 'LATICINIOS', 'FRIOS') THEN 'laticínios/frios'
    WHEN UPPER(categoria) IN ('HIGIENE', 'FARMÁCIA', 'FARMACIA') THEN 'higiene/farmácia'
    WHEN UPPER(categoria) = 'HORTIFRUTI' THEN 'hortifruti'
    WHEN UPPER(categoria) = 'BEBIDAS' THEN 'bebidas'
    WHEN UPPER(categoria) = 'MERCEARIA' THEN 'mercearia'
    WHEN UPPER(categoria) = 'PADARIA' THEN 'padaria'
    WHEN UPPER(categoria) = 'LIMPEZA' THEN 'limpeza'
    WHEN UPPER(categoria) = 'CONGELADOS' THEN 'congelados'
    WHEN UPPER(categoria) = 'PET' THEN 'pet'
    ELSE 'outros'
END
WHERE categoria IS NOT NULL;

-- Atualizar também na tabela precos_atuais se existir campo categoria
-- (caso exista, senão essa query será ignorada)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'precos_atuais' AND column_name = 'categoria') THEN
        UPDATE precos_atuais 
        SET categoria = CASE 
            WHEN UPPER(categoria) IN ('CARNES', 'CARNE', 'AÇOUGUE') THEN 'açougue'
            WHEN UPPER(categoria) IN ('LATICÍNIOS', 'LATICINIOS', 'FRIOS') THEN 'laticínios/frios'
            WHEN UPPER(categoria) IN ('HIGIENE', 'FARMÁCIA', 'FARMACIA') THEN 'higiene/farmácia'
            WHEN UPPER(categoria) = 'HORTIFRUTI' THEN 'hortifruti'
            WHEN UPPER(categoria) = 'BEBIDAS' THEN 'bebidas'
            WHEN UPPER(categoria) = 'MERCEARIA' THEN 'mercearia'
            WHEN UPPER(categoria) = 'PADARIA' THEN 'padaria'
            WHEN UPPER(categoria) = 'LIMPEZA' THEN 'limpeza'
            WHEN UPPER(categoria) = 'CONGELADOS' THEN 'congelados'
            WHEN UPPER(categoria) = 'PET' THEN 'pet'
            ELSE 'outros'
        END
        WHERE categoria IS NOT NULL;
    END IF;
END $$;

-- Adicionar constraint check para garantir apenas as 11 categorias válidas
ALTER TABLE estoque_app 
DROP CONSTRAINT IF EXISTS check_categoria_valida;

ALTER TABLE estoque_app 
ADD CONSTRAINT check_categoria_valida 
CHECK (categoria IN ('hortifruti', 'bebidas', 'mercearia', 'açougue', 'padaria', 'laticínios/frios', 'limpeza', 'higiene/farmácia', 'congelados', 'pet', 'outros'));