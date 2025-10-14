-- 1. CORREÇÃO IMEDIATA: Deletar candidatos órfãos e nota travada
DELETE FROM produtos_candidatos_normalizacao 
WHERE nota_imagem_id = '1809d997-03d7-4548-b44b-899fa2ea5da5';

DELETE FROM notas_imagens 
WHERE id = '1809d997-03d7-4548-b44b-899fa2ea5da5';

-- 2. MELHORAR TRIGGER: Incluir deleção de candidatos de normalização
CREATE OR REPLACE FUNCTION reverter_estoque_nota_excluida()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    item_record RECORD;
    estoque_record RECORD;
    nova_quantidade NUMERIC;
    nome_normalizado TEXT;
    encontrado BOOLEAN;
    normalizacao_record RECORD;
BEGIN
    RAISE NOTICE 'Revertendo estoque da nota ID: %', OLD.id;
    
    -- CRÍTICO: Deletar candidatos de normalização vinculados a esta nota
    DELETE FROM produtos_candidatos_normalizacao WHERE nota_imagem_id = OLD.id;
    RAISE NOTICE 'Candidatos de normalização deletados para nota ID: %', OLD.id;
    
    -- Se a nota está em estado inconsistente, apenas limpar estoque
    IF OLD.normalizada = true AND OLD.processada = false THEN
        RAISE NOTICE 'Nota % em estado inconsistente - apenas limpando estoque', OLD.id;
        DELETE FROM estoque_app WHERE nota_id = OLD.id;
        RETURN OLD;
    END IF;
    
    -- Se não processada, limpar estoque residual
    IF NOT OLD.processada THEN
        RAISE NOTICE 'Nota % não foi processada, limpando estoque residual', OLD.id;
        DELETE FROM estoque_app WHERE nota_id = OLD.id;
        RETURN OLD;
    END IF;
    
    -- Se sem dados extraídos, limpar estoque residual
    IF OLD.dados_extraidos IS NULL THEN
        RAISE NOTICE 'Nota % não possui dados extraídos, limpando estoque residual', OLD.id;
        DELETE FROM estoque_app WHERE nota_id = OLD.id;
        RETURN OLD;
    END IF;
    
    -- Processar itens da nota
    FOR item_record IN 
        SELECT 
            item->>'descricao' as descricao,
            COALESCE((item->>'quantidade')::NUMERIC, 0) as quantidade
        FROM jsonb_array_elements(OLD.dados_extraidos->'itens') as item
        WHERE item->>'descricao' IS NOT NULL
        AND COALESCE((item->>'quantidade')::NUMERIC, 0) > 0
    LOOP
        nome_normalizado := UPPER(TRIM(item_record.descricao));
        
        FOR normalizacao_record IN 
            SELECT termo_errado, termo_correto 
            FROM normalizacoes_nomes 
            WHERE ativo = true
        LOOP
            nome_normalizado := REGEXP_REPLACE(
                nome_normalizado, 
                '\b' || normalizacao_record.termo_errado || '\b', 
                normalizacao_record.termo_correto, 
                'gi'
            );
        END LOOP;
        
        nome_normalizado := REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(nome_normalizado, '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b', 'PAO DE FORMA', 'gi'),
                    '\b(ACHOCOLATADO EM PO NESCAU)\s*(380G|3\.0|30KG|\d+G)?\b', 'ACHOCOLATADO EM PO', 'gi'
                ),
                '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL|\d+G|\d+ML|\d+L|\d+KG)\b', '', 'gi'
            ),
            '\s+', ' ', 'g'
        );
        
        nome_normalizado := TRIM(nome_normalizado);
        encontrado := FALSE;
        
        SELECT * INTO estoque_record
        FROM estoque_app 
        WHERE user_id = OLD.usuario_id
        AND produto_nome = nome_normalizado
        LIMIT 1;
        
        IF NOT FOUND THEN
            SELECT * INTO estoque_record
            FROM estoque_app 
            WHERE user_id = OLD.usuario_id
            AND (
                UPPER(produto_nome) LIKE '%' || UPPER(TRIM(item_record.descricao)) || '%'
                OR UPPER(TRIM(item_record.descricao)) LIKE '%' || UPPER(produto_nome) || '%'
                OR similarity(UPPER(produto_nome), UPPER(item_record.descricao)) > 0.7
            )
            ORDER BY similarity(UPPER(produto_nome), UPPER(item_record.descricao)) DESC
            LIMIT 1;
        END IF;
        
        IF FOUND THEN
            encontrado := TRUE;
            nova_quantidade := GREATEST(0, estoque_record.quantidade - item_record.quantidade);
            
            IF nova_quantidade = 0 THEN
                DELETE FROM estoque_app WHERE id = estoque_record.id;
                RAISE NOTICE 'Produto deletado: %', estoque_record.produto_nome;
            ELSE
                UPDATE estoque_app 
                SET quantidade = nova_quantidade, updated_at = now()
                WHERE id = estoque_record.id;
                RAISE NOTICE 'Estoque revertido: %', estoque_record.produto_nome;
            END IF;
        END IF;
    END LOOP;
    
    DELETE FROM estoque_app WHERE nota_id = OLD.id;
    RAISE NOTICE 'Reversão concluída para nota ID: %', OLD.id;
    RETURN OLD;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Erro ao reverter estoque da nota %: %. Limpando estoque residual.', OLD.id, SQLERRM;
        DELETE FROM produtos_candidatos_normalizacao WHERE nota_imagem_id = OLD.id;
        DELETE FROM estoque_app WHERE nota_id = OLD.id;
        RETURN OLD;
END;
$$;

-- 3. MELHORAR FUNÇÃO DE CORREÇÃO: Incluir limpeza de candidatos
CREATE OR REPLACE FUNCTION corrigir_notas_estado_inconsistente()
RETURNS TABLE(nota_id uuid, acao text, detalhes text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    nota_record RECORD;
    itens_deletados integer;
    candidatos_deletados integer;
BEGIN
    FOR nota_record IN 
        SELECT id, usuario_id, nome_original, normalizada, processada, produtos_normalizados
        FROM notas_imagens
        WHERE normalizada = true 
          AND processada = false
    LOOP
        -- Deletar candidatos de normalização primeiro
        DELETE FROM produtos_candidatos_normalizacao WHERE nota_imagem_id = nota_record.id;
        GET DIAGNOSTICS candidatos_deletados = ROW_COUNT;
        
        -- Deletar itens do estoque
        DELETE FROM estoque_app WHERE nota_id = nota_record.id;
        GET DIAGNOSTICS itens_deletados = ROW_COUNT;
        
        -- Resetar estado da nota
        UPDATE notas_imagens 
        SET normalizada = false,
            tentativas_normalizacao = 0,
            produtos_normalizados = 0,
            updated_at = now()
        WHERE id = nota_record.id;
        
        RETURN QUERY SELECT 
            nota_record.id,
            'CORRIGIDO'::text,
            format('Nota %s resetada. %s candidatos e %s itens removidos.', 
                   COALESCE(nota_record.nome_original, 'sem nome'), 
                   candidatos_deletados,
                   itens_deletados)::text;
    END LOOP;
    
    RETURN;
END;
$$;

-- 4. ADICIONAR CASCADE NA FOREIGN KEY
ALTER TABLE produtos_candidatos_normalizacao 
DROP CONSTRAINT IF EXISTS produtos_candidatos_normalizacao_nota_imagem_id_fkey;

ALTER TABLE produtos_candidatos_normalizacao 
ADD CONSTRAINT produtos_candidatos_normalizacao_nota_imagem_id_fkey 
FOREIGN KEY (nota_imagem_id) 
REFERENCES notas_imagens(id) 
ON DELETE CASCADE;

-- 5. EXECUTAR CORREÇÃO PARA LIMPAR OUTRAS INCONSISTÊNCIAS
SELECT * FROM corrigir_notas_estado_inconsistente();