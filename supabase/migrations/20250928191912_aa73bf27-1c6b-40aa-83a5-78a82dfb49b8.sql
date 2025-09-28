-- Função para sincronizar chave de acesso das notas_imagens para notas_fiscais e compras_app
CREATE OR REPLACE FUNCTION public.sync_access_key_from_notas_imagens()
RETURNS TRIGGER AS $$
DECLARE
    chave_extraida TEXT;
    nota_fiscal_updated INTEGER := 0;
    compra_updated INTEGER := 0;
BEGIN
    -- Extrair chave de acesso dos dados JSON (tentar diferentes caminhos)
    chave_extraida := COALESCE(
        NEW.dados_extraidos->'compra'->>'chave_acesso',
        NEW.dados_extraidos->>'chave_acesso',
        NEW.dados_extraidos->'nota_fiscal'->>'chave_acesso'
    );
    
    -- Verificar se encontrou uma chave válida de 44 dígitos
    IF chave_extraida IS NOT NULL AND LENGTH(TRIM(chave_extraida)) = 44 THEN
        chave_extraida := TRIM(chave_extraida);
        
        -- Atualizar notas_fiscais (buscar por usuário e sem chave ou com chave vazia)
        UPDATE notas_fiscais 
        SET chave_acesso = chave_extraida,
            updated_at = now()
        WHERE user_id = NEW.usuario_id 
        AND (chave_acesso IS NULL OR chave_acesso = '' OR LENGTH(TRIM(chave_acesso)) < 44)
        AND created_at >= (NEW.created_at - INTERVAL '1 hour') -- Notas criadas próximo ao tempo da imagem
        AND created_at <= (NEW.created_at + INTERVAL '1 hour');
        
        GET DIAGNOSTICS nota_fiscal_updated = ROW_COUNT;
        
        -- Atualizar compras_app (buscar por usuário e sem chave ou com chave vazia)
        UPDATE compras_app 
        SET chave_acesso = chave_extraida,
            updated_at = now()
        WHERE user_id = NEW.usuario_id 
        AND (chave_acesso IS NULL OR chave_acesso = '' OR LENGTH(TRIM(chave_acesso)) < 44)
        AND created_at >= (NEW.created_at - INTERVAL '1 hour') -- Compras criadas próximo ao tempo da imagem
        AND created_at <= (NEW.created_at + INTERVAL '1 hour');
        
        GET DIAGNOSTICS compra_updated = ROW_COUNT;
        
        -- Log da operação para debug
        RAISE NOTICE 'Chave de acesso % sincronizada para usuário %: % notas_fiscais e % compras_app atualizadas', 
            chave_extraida, NEW.usuario_id, nota_fiscal_updated, compra_updated;
    ELSE
        RAISE NOTICE 'Chave de acesso não encontrada ou inválida na nota_imagem % para usuário %', 
            NEW.id, NEW.usuario_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger que dispara após atualização em notas_imagens
CREATE TRIGGER trigger_sync_access_key_after_processing
    AFTER UPDATE ON notas_imagens
    FOR EACH ROW
    WHEN (
        NEW.dados_extraidos IS NOT NULL 
        AND NEW.processada = true 
        AND (OLD.processada = false OR OLD.dados_extraidos IS NULL)
    )
    EXECUTE FUNCTION public.sync_access_key_from_notas_imagens();

-- Função auxiliar para sincronizar dados históricos (execução manual)
CREATE OR REPLACE FUNCTION public.sync_historical_access_keys(target_user_id uuid DEFAULT NULL)
RETURNS TABLE(
    usuario_id uuid,
    chave_acesso text,
    notas_fiscais_updated integer,
    compras_app_updated integer
) AS $$
DECLARE
    nota_record RECORD;
    chave_extraida TEXT;
    nota_fiscal_updated INTEGER;
    compra_updated INTEGER;
BEGIN
    -- Iterar sobre notas processadas com dados extraídos
    FOR nota_record IN 
        SELECT ni.id, ni.usuario_id, ni.dados_extraidos, ni.created_at
        FROM notas_imagens ni
        WHERE ni.processada = true 
        AND ni.dados_extraidos IS NOT NULL
        AND (target_user_id IS NULL OR ni.usuario_id = target_user_id)
        ORDER BY ni.created_at DESC
    LOOP
        -- Extrair chave de acesso
        chave_extraida := COALESCE(
            nota_record.dados_extraidos->'compra'->>'chave_acesso',
            nota_record.dados_extraidos->>'chave_acesso',
            nota_record.dados_extraidos->'nota_fiscal'->>'chave_acesso'
        );
        
        -- Se encontrou chave válida, sincronizar
        IF chave_extraida IS NOT NULL AND LENGTH(TRIM(chave_extraida)) = 44 THEN
            chave_extraida := TRIM(chave_extraida);
            
            -- Atualizar notas_fiscais
            UPDATE notas_fiscais 
            SET chave_acesso = chave_extraida,
                updated_at = now()
            WHERE user_id = nota_record.usuario_id 
            AND (chave_acesso IS NULL OR chave_acesso = '' OR LENGTH(TRIM(chave_acesso)) < 44)
            AND created_at >= (nota_record.created_at - INTERVAL '1 hour')
            AND created_at <= (nota_record.created_at + INTERVAL '1 hour');
            
            GET DIAGNOSTICS nota_fiscal_updated = ROW_COUNT;
            
            -- Atualizar compras_app
            UPDATE compras_app 
            SET chave_acesso = chave_extraida,
                updated_at = now()
            WHERE user_id = nota_record.usuario_id 
            AND (chave_acesso IS NULL OR chave_acesso = '' OR LENGTH(TRIM(chave_acesso)) < 44)
            AND created_at >= (nota_record.created_at - INTERVAL '1 hour')
            AND created_at <= (nota_record.created_at + INTERVAL '1 hour');
            
            GET DIAGNOSTICS compra_updated = ROW_COUNT;
            
            -- Retornar resultado se houve atualizações
            IF nota_fiscal_updated > 0 OR compra_updated > 0 THEN
                RETURN QUERY SELECT 
                    nota_record.usuario_id,
                    chave_extraida,
                    nota_fiscal_updated,
                    compra_updated;
            END IF;
        END IF;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;