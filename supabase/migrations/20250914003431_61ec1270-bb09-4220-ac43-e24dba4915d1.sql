-- Inserir preço do SABÃO EM PÓ SURF EXPLOSÃO DE FLORES na tabela de preços atuais
INSERT INTO precos_atuais (
  produto_nome, 
  valor_unitario, 
  estabelecimento_cnpj, 
  estabelecimento_nome,
  data_atualizacao
) VALUES (
  'SABÃO EM PÓ SURF EXPLOSÃO DE FLORES',
  9.39,
  '17493338000397',
  'COSTAZUL ALIMENTOS LTDA',
  now()
) ON CONFLICT DO NOTHING;

-- Criar função para automaticamente popular preços atuais baseado nas notas fiscais
CREATE OR REPLACE FUNCTION public.popular_precos_atuais_das_notas()
RETURNS void AS $$
DECLARE
    nota_record RECORD;
    item_record JSONB;
    produto_normalizado TEXT;
    cnpj_normalizado TEXT;
    nome_estabelecimento TEXT;
BEGIN
    -- Iterar sobre todas as notas processadas
    FOR nota_record IN 
        SELECT id, dados_extraidos 
        FROM notas_imagens 
        WHERE processada = true 
        AND dados_extraidos IS NOT NULL
        AND dados_extraidos::text != '{}'::text
    LOOP
        -- Extrair dados do estabelecimento
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
        
        -- Processar itens da nota
        IF nota_record.dados_extraidos->'itens' IS NOT NULL THEN
            FOR item_record IN 
                SELECT * FROM JSONB_ARRAY_ELEMENTS(nota_record.dados_extraidos->'itens')
                WHERE value->>'descricao' IS NOT NULL
                AND COALESCE((value->>'valor_unitario')::numeric, 0) > 0
            LOOP
                -- Normalizar nome do produto
                produto_normalizado := UPPER(TRIM(item_record->>'descricao'));
                
                -- Aplicar normalizações específicas
                produto_normalizado := REGEXP_REPLACE(produto_normalizado, 'EXPLO\.DE', 'EXPLOSÃO DE', 'gi');
                produto_normalizado := REGEXP_REPLACE(produto_normalizado, '\b(\d+G|\d+ML|\d+L|\d+KG)\b', '', 'gi');
                produto_normalizado := REGEXP_REPLACE(produto_normalizado, '\s+', ' ', 'g');
                produto_normalizado := TRIM(produto_normalizado);
                
                -- Inserir/atualizar na tabela precos_atuais
                INSERT INTO precos_atuais (
                    produto_nome,
                    valor_unitario,
                    estabelecimento_cnpj,
                    estabelecimento_nome,
                    data_atualizacao
                ) VALUES (
                    produto_normalizado,
                    (item_record->>'valor_unitario')::numeric,
                    cnpj_normalizado,
                    nome_estabelecimento,
                    now()
                ) ON CONFLICT (produto_nome, estabelecimento_cnpj) 
                DO UPDATE SET
                    valor_unitario = EXCLUDED.valor_unitario,
                    data_atualizacao = EXCLUDED.data_atualizacao
                WHERE precos_atuais.data_atualizacao < EXCLUDED.data_atualizacao;
                
            END LOOP;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Preços atuais populados automaticamente das notas fiscais';
END;
$$ LANGUAGE plpgsql;