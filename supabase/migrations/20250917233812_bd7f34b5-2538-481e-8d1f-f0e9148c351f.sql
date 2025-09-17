-- LIMPEZA COMPLETA DE RESÍDUOS - Sistema totalmente zerado
-- 1. Limpar todos os produtos do estoque do usuário
DELETE FROM estoque_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 2. Limpar todos os preços de usuário 
DELETE FROM precos_atuais_usuario 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 3. Limpar preços gerais relacionados aos CNPJs do usuário (caso existam)
DELETE FROM precos_atuais 
WHERE estabelecimento_cnpj IN (
    SELECT DISTINCT regexp_replace(COALESCE((dados_extraidos->>'cnpj'), ''), '[^\d]', '', 'g')
    FROM notas_imagens 
    WHERE usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
    AND dados_extraidos IS NOT NULL
    AND regexp_replace(COALESCE((dados_extraidos->>'cnpj'), ''), '[^\d]', '', 'g') != ''
)
OR estabelecimento_cnpj IN (
    SELECT DISTINCT regexp_replace(COALESCE((dados_extraidos->'estabelecimento'->>'cnpj'), ''), '[^\d]', '', 'g')
    FROM notas_imagens 
    WHERE usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
    AND dados_extraidos IS NOT NULL
    AND regexp_replace(COALESCE((dados_extraidos->'estabelecimento'->>'cnpj'), ''), '[^\d]', '', 'g') != ''
);

-- 4. Confirmar que todas as notas foram realmente excluídas
DELETE FROM notas_imagens 
WHERE usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- 5. Limpar qualquer compra relacionada
DELETE FROM compras_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';