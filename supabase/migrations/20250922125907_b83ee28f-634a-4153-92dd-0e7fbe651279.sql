-- Verificar e corrigir a constraint de categoria válida usando a coluna correta
DO $$
DECLARE
    constraint_exists BOOLEAN;
BEGIN
    -- Verificar se a constraint existe
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_categoria_valida' 
        AND conrelid = 'estoque_app'::regclass
    ) INTO constraint_exists;
    
    -- Se a constraint existe, removê-la
    IF constraint_exists THEN
        ALTER TABLE estoque_app DROP CONSTRAINT check_categoria_valida;
        RAISE NOTICE 'Constraint antiga removida';
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