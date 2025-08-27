-- Função para limpar completamente o estoque de um usuário
CREATE OR REPLACE FUNCTION public.limpar_estoque_usuario(usuario_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Deletar todo o estoque do usuário
    DELETE FROM estoque_app WHERE user_id = usuario_uuid;
    
    RAISE NOTICE 'Estoque do usuário % limpo completamente', usuario_uuid;
END;
$function$;

-- Função para recalcular estoque completo baseado nas compras existentes
CREATE OR REPLACE FUNCTION public.recalcular_estoque_usuario(usuario_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    item_record RECORD;
    produto_record RECORD;
    nome_normalizado TEXT;
    estoque_record RECORD;
BEGIN
    -- Primeiro limpar o estoque atual
    DELETE FROM estoque_app WHERE user_id = usuario_uuid;
    
    RAISE NOTICE 'Recalculando estoque para usuário: %', usuario_uuid;
    
    -- Iterar sobre todos os itens de compra do usuário
    FOR item_record IN 
        SELECT 
            ic.produto_id,
            ic.quantidade,
            ic.preco_unitario,
            p.nome as produto_nome,
            p.unidade_medida,
            c.user_id
        FROM itens_compra_app ic
        JOIN compras_app c ON ic.compra_id = c.id
        JOIN produtos_app p ON ic.produto_id = p.id
        WHERE c.user_id = usuario_uuid
        ORDER BY c.data_compra, c.hora_compra
    LOOP
        -- Normalizar nome do produto
        nome_normalizado := UPPER(TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(item_record.produto_nome, '\b(GRAENC|GRANEL)\b', 'GRANEL', 'gi'),
                        '\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO)?\b', 'PAO DE FORMA', 'gi'
                    ),
                    '\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|\d+G|\d+ML|\d+L)\b', '', 'gi'
                ),
                '\s+', ' ', 'g'
            )
        ));
        
        -- Verificar se já existe no estoque
        SELECT * INTO estoque_record
        FROM estoque_app 
        WHERE user_id = usuario_uuid
        AND produto_nome = nome_normalizado;
        
        IF FOUND THEN
            -- Atualizar quantidade existente
            UPDATE estoque_app 
            SET 
                quantidade = quantidade + item_record.quantidade,
                preco_unitario_ultimo = item_record.preco_unitario,
                updated_at = now()
            WHERE id = estoque_record.id;
        ELSE
            -- Criar novo item no estoque
            INSERT INTO estoque_app (
                user_id,
                produto_nome,
                categoria,
                quantidade,
                unidade_medida,
                preco_unitario_ultimo
            ) VALUES (
                usuario_uuid,
                nome_normalizado,
                'outros', -- categoria padrão
                item_record.quantidade,
                item_record.unidade_medida,
                item_record.preco_unitario
            );
        END IF;
        
    END LOOP;
    
    RAISE NOTICE 'Recálculo de estoque concluído para usuário: %', usuario_uuid;
END;
$function$;