-- Verificar e corrigir a constraint de categoria válida
-- Primeiro, vamos ver as categorias válidas atuais
DO $$
DECLARE
    constraint_definition TEXT;
BEGIN
    -- Buscar a definição da constraint
    SELECT consrc INTO constraint_definition
    FROM pg_constraint 
    WHERE conname = 'check_categoria_valida' 
    AND conrelid = 'estoque_app'::regclass;
    
    -- Se a constraint existe, vamos removê-la e recriar com as categorias corretas
    IF constraint_definition IS NOT NULL THEN
        ALTER TABLE estoque_app DROP CONSTRAINT IF EXISTS check_categoria_valida;
        RAISE NOTICE 'Constraint antiga removida: %', constraint_definition;
    END IF;
    
    -- Criar nova constraint com todas as categorias válidas
    ALTER TABLE estoque_app ADD CONSTRAINT check_categoria_valida 
    CHECK (categoria IN (
        'hortifruti',
        'mercearia', 
        'bebidas',
        'laticínios/frios',
        'limpeza',
        'higiene/farmácia',
        'açougue',
        'padaria',
        'congelados',
        'pet',
        'outros'
    ));
    
    RAISE NOTICE 'Nova constraint criada com categorias válidas';
END $$;