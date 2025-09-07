-- Remover registros de preços atuais criados por inserções manuais
-- Estes registros violam as regras de negócio: apenas notas fiscais devem criar preços atuais
DELETE FROM precos_atuais 
WHERE estabelecimento_nome = 'Inserção Manual do Usuário' 
   OR estabelecimento_cnpj LIKE 'INSERÇÃO_MANUAL_%';