-- Teste de inserção direta no estoque para verificar RLS
-- Vamos criar uma função temporária para testar a inserção como se fosse o edge function

DO $$
DECLARE
    test_user_id uuid := 'ae5b5501-7f8a-46da-9cba-b9955a84e697'; -- ID do usuário dos logs
BEGIN
    -- Inserir um item de teste no estoque
    INSERT INTO estoque_app (
        user_id,
        produto_nome,
        categoria,
        quantidade,
        unidade_medida,
        preco_unitario_ultimo,
        origem
    ) VALUES (
        test_user_id,
        'TESTE PROCESSO',
        'outros',
        1,
        'UN',
        10.99,
        'nota_fiscal'
    );
    
    RAISE NOTICE 'Teste de inserção no estoque realizado com sucesso';
END $$;