-- 1. Criar constraint única para permitir upsert correto (se ainda não existe)
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE precos_atuais 
        ADD CONSTRAINT unique_produto_estabelecimento 
        UNIQUE (produto_nome, estabelecimento_cnpj);
    EXCEPTION
        WHEN duplicate_table THEN 
            -- Constraint já existe, ignorar
            NULL;
    END;
END $$;