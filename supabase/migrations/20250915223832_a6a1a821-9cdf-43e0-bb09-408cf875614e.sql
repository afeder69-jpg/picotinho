-- Limpeza completa de dados residuais para usuário a.feder69@gmail.com
-- UUID do usuário: ae5b5501-7f8a-46da-9cba-b9955a84e697

-- 1. Remover itens de compra (foreign key para compras)
DELETE FROM itens_compra_app 
WHERE compra_id IN (
    SELECT id FROM compras_app 
    WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
);

-- 2. Remover compras
DELETE FROM compras_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 3. Remover itens de nota (foreign key para notas_fiscais)
DELETE FROM itens_nota 
WHERE nota_id IN (
    SELECT id FROM notas_fiscais 
    WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
);

-- 4. Remover notas fiscais
DELETE FROM notas_fiscais 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 5. Remover estoque (mesmo os com quantidade 0)
DELETE FROM estoque_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 6. Remover preços manuais do usuário
DELETE FROM precos_atuais_usuario 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 7. Verificar se há dados em outras tabelas relacionadas
DELETE FROM receipts 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

DELETE FROM receipt_items 
WHERE receipt_id IN (
    SELECT id FROM receipts 
    WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
);

DELETE FROM notas 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

DELETE FROM produtos 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

DELETE FROM mercados 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

DELETE FROM categorias 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- Log da limpeza
DO $$
BEGIN
    RAISE NOTICE 'Limpeza completa executada para usuário ae5b5501-7f8a-46da-9cba-b9955a84e697 (a.feder69@gmail.com)';
    RAISE NOTICE 'Todas as tabelas relacionadas foram limpas para evitar duplicidade ao lançar novas notas';
END $$;