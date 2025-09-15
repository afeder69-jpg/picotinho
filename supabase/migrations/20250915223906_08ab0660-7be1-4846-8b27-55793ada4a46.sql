-- Limpeza completa e cuidadosa para usuário a.feder69@gmail.com
-- UUID do usuário: ae5b5501-7f8a-46da-9cba-b9955a84e697

-- 1. Primeiro, remover itens que dependem de outros
DELETE FROM receipt_items 
WHERE receipt_id IN (
    SELECT id FROM receipts 
    WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
);

-- 2. Remover receipts
DELETE FROM receipts 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 3. Remover itens de compra
DELETE FROM itens_compra_app 
WHERE compra_id IN (
    SELECT id FROM compras_app 
    WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
);

-- 4. Remover compras
DELETE FROM compras_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 5. Remover itens de nota
DELETE FROM itens_nota 
WHERE nota_id IN (
    SELECT id FROM notas_fiscais 
    WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
);

-- 6. Remover notas fiscais
DELETE FROM notas_fiscais 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 7. Remover notas_imagens (já estava vazio, mas para garantir)
DELETE FROM notas_imagens 
WHERE usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 8. Remover estoque
DELETE FROM estoque_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 9. Remover preços manuais do usuário
DELETE FROM precos_atuais_usuario 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 10. Remover produtos do usuário
DELETE FROM produtos 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 11. Remover mercados do usuário
DELETE FROM mercados 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 12. Remover notas antigas
DELETE FROM notas 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- NÃO remover categorias pois pode ter foreign key com produtos_app globais

-- Resetar configurações para padrão (manter a conta, só resetar configurações)
UPDATE configuracoes_usuario 
SET raio_busca_km = 5.0
WHERE usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- Log da limpeza
DO $$
BEGIN
    RAISE NOTICE 'Limpeza completa executada para usuário ae5b5501-7f8a-46da-9cba-b9955a84e697 (a.feder69@gmail.com)';
    RAISE NOTICE 'Banco de dados limpo e pronto para lançar novas notas sem duplicidade';
END $$;