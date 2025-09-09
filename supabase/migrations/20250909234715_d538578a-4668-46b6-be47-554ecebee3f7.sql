-- Primeiro, remover o trigger problemático com o nome correto
DROP TRIGGER IF EXISTS verificar_precos_manuais_trigger ON notas_imagens;

-- Agora podemos remover a função problemática  
DROP FUNCTION IF EXISTS verificar_precos_manuais_pos_nota();

-- Limpar todos os registros incorretos da tabela precos_atuais_usuario
-- que foram marcados como 'manual' mas que existem em notas fiscais
DELETE FROM precos_atuais_usuario 
WHERE origem = 'manual'
AND EXISTS (
    SELECT 1 FROM notas_imagens ni,
        jsonb_array_elements(COALESCE(ni.dados_extraidos->'itens', '[]'::jsonb)) as item
    WHERE ni.usuario_id = precos_atuais_usuario.user_id
    AND ni.processada = true
    AND ni.dados_extraidos IS NOT NULL
    AND (
        -- Usar a mesma normalização da edge function
        UPPER(TRIM(REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(COALESCE(item->>'descricao', item->>'nome', ''), '\b(GRAENC|GRANEL)\b', 'GRANEL', 'gi'),
                    '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b', 'PAO DE FORMA', 'gi'
                ),
                '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|\d+G|\d+ML|\d+L)\b', '', 'gi'
            ),
            '\s+', ' ', 'g'
        ))) = UPPER(TRIM(precos_atuais_usuario.produto_nome))
        OR
        -- Comparação com similaridade
        UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) LIKE '%' || UPPER(TRIM(precos_atuais_usuario.produto_nome)) || '%'
        OR
        UPPER(TRIM(precos_atuais_usuario.produto_nome)) LIKE '%' || UPPER(TRIM(COALESCE(item->>'descricao', item->>'nome', ''))) || '%'
    )
);