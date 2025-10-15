-- PASSO 1: Adicionar coluna user_id à tabela precos_atuais
ALTER TABLE precos_atuais 
ADD COLUMN user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE;

-- PASSO 2: Popular user_id nos dados existentes baseado no estabelecimento_cnpj
UPDATE precos_atuais pa
SET user_id = ni.usuario_id
FROM notas_imagens ni
WHERE pa.user_id IS NULL
AND ni.processada = true
AND ni.dados_extraidos IS NOT NULL
AND (
  regexp_replace(COALESCE(ni.dados_extraidos->>'cnpj', ''), '[^\d]', '', 'g') = regexp_replace(pa.estabelecimento_cnpj, '[^\d]', '', 'g')
  OR regexp_replace(COALESCE(ni.dados_extraidos->'estabelecimento'->>'cnpj', ''), '[^\d]', '', 'g') = regexp_replace(pa.estabelecimento_cnpj, '[^\d]', '', 'g')
  OR regexp_replace(COALESCE(ni.dados_extraidos->'supermercado'->>'cnpj', ''), '[^\d]', '', 'g') = regexp_replace(pa.estabelecimento_cnpj, '[^\d]', '', 'g')
  OR regexp_replace(COALESCE(ni.dados_extraidos->'emitente'->>'cnpj', ''), '[^\d]', '', 'g') = regexp_replace(pa.estabelecimento_cnpj, '[^\d]', '', 'g')
);

-- PASSO 3: Criar índice para otimizar buscas
CREATE INDEX IF NOT EXISTS idx_precos_atuais_user_id ON precos_atuais(user_id);
CREATE INDEX IF NOT EXISTS idx_precos_atuais_user_estabelecimento ON precos_atuais(user_id, estabelecimento_cnpj);

-- PASSO 4: Atualizar RLS policies para incluir user_id
DROP POLICY IF EXISTS "Sistema pode inserir preços atuais" ON precos_atuais;
DROP POLICY IF EXISTS "Sistema pode atualizar preços atuais" ON precos_atuais;
DROP POLICY IF EXISTS "Usuários autenticados podem ver preços de estabelecimentos on" ON precos_atuais;
DROP POLICY IF EXISTS "Usuários autenticados podem ver dados agregados de preços" ON precos_atuais;

CREATE POLICY "Sistema pode inserir preços atuais"
ON precos_atuais
FOR INSERT
TO authenticated
WITH CHECK (
  current_setting('role', true) = 'service_role'
  OR (auth.jwt()->>'role') = 'service_role'
  OR auth.uid() IS NULL
  OR auth.uid() = user_id
);

CREATE POLICY "Sistema pode atualizar preços atuais"
ON precos_atuais
FOR UPDATE
TO authenticated
USING (
  current_setting('role', true) = 'service_role'
  OR (auth.jwt()->>'role') = 'service_role'
  OR auth.uid() IS NULL
  OR auth.uid() = user_id
);

CREATE POLICY "Usuários podem ver seus preços"
ON precos_atuais
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- PASSO 5: Recriar função popular_precos_atuais_das_notas com user_id
CREATE OR REPLACE FUNCTION popular_precos_atuais_das_notas()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
    nota_record RECORD;
    item_record JSONB;
    produto_normalizado TEXT;
    cnpj_normalizado TEXT;
    nome_estabelecimento TEXT;
    usuario_nota_id UUID;
BEGIN
    FOR nota_record IN 
        SELECT id, dados_extraidos, usuario_id
        FROM notas_imagens 
        WHERE processada = true 
        AND dados_extraidos IS NOT NULL
        AND dados_extraidos::text != '{}'::text
    LOOP
        usuario_nota_id := nota_record.usuario_id;
        
        cnpj_normalizado := regexp_replace(
            COALESCE(
                nota_record.dados_extraidos->>'cnpj',
                nota_record.dados_extraidos->'estabelecimento'->>'cnpj',
                nota_record.dados_extraidos->'supermercado'->>'cnpj',
                nota_record.dados_extraidos->'emitente'->>'cnpj'
            ), '[^\d]', '', 'g'
        );
        
        nome_estabelecimento := COALESCE(
            nota_record.dados_extraidos->'estabelecimento'->>'nome',
            nota_record.dados_extraidos->'supermercado'->>'nome',
            nota_record.dados_extraidos->'emitente'->>'nome'
        );
        
        IF nota_record.dados_extraidos->'itens' IS NOT NULL THEN
            FOR item_record IN 
                SELECT * FROM JSONB_ARRAY_ELEMENTS(nota_record.dados_extraidos->'itens')
                WHERE value->>'descricao' IS NOT NULL
                AND COALESCE((value->>'valor_unitario')::numeric, 0) > 0
            LOOP
                produto_normalizado := UPPER(TRIM(item_record->>'descricao'));
                
                produto_normalizado := REGEXP_REPLACE(produto_normalizado, 'EXPLO\.DE', 'EXPLOSÃO DE', 'gi');
                produto_normalizado := REGEXP_REPLACE(produto_normalizado, '\b(\d+G|\d+ML|\d+L|\d+KG)\b', '', 'gi');
                produto_normalizado := REGEXP_REPLACE(produto_normalizado, '\s+', ' ', 'g');
                produto_normalizado := TRIM(produto_normalizado);
                
                INSERT INTO precos_atuais (
                    user_id,
                    produto_nome,
                    valor_unitario,
                    estabelecimento_cnpj,
                    estabelecimento_nome,
                    data_atualizacao
                ) VALUES (
                    usuario_nota_id,
                    produto_normalizado,
                    (item_record->>'valor_unitario')::numeric,
                    cnpj_normalizado,
                    nome_estabelecimento,
                    now()
                ) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
                DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    valor_unitario = EXCLUDED.valor_unitario,
                    data_atualizacao = EXCLUDED.data_atualizacao
                WHERE precos_atuais.data_atualizacao < EXCLUDED.data_atualizacao;
                
            END LOOP;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Preços atuais populados com user_id das notas fiscais';
END;
$function$;