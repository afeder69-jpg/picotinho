-- Atualizar a função de sincronização para considerar preços menores de outros usuários
CREATE OR REPLACE FUNCTION public.sincronizar_preco_manual()
RETURNS TRIGGER AS $$
DECLARE
    preco_geral_menor NUMERIC;
BEGIN
    -- Se o produto foi inserido/atualizado manualmente (não veio de nota fiscal)
    -- e tem um preço válido, criar/atualizar o preço atual do usuário
    IF NEW.preco_unitario_ultimo IS NOT NULL AND NEW.preco_unitario_ultimo > 0 THEN
        -- Verificar se é uma inserção manual (não há notas fiscais com este produto)
        IF NOT EXISTS (
            SELECT 1 FROM notas_imagens ni 
            WHERE ni.dados_extraidos::text LIKE '%' || NEW.produto_nome || '%'
            AND ni.processada = true
            AND ni.usuario_id = NEW.user_id
        ) THEN
            -- Verificar se existe um preço menor na tabela de preços gerais (outros usuários)
            SELECT MIN(valor_unitario) INTO preco_geral_menor
            FROM precos_atuais pa
            WHERE UPPER(pa.produto_nome) = UPPER(NEW.produto_nome)
               OR UPPER(pa.produto_nome) LIKE '%' || UPPER(NEW.produto_nome) || '%'
               OR UPPER(NEW.produto_nome) LIKE '%' || UPPER(pa.produto_nome) || '%';
            
            -- Se existe um preço geral menor, usar esse valor
            -- Senão, usar o valor inserido pelo usuário
            INSERT INTO public.precos_atuais_usuario (
                user_id,
                produto_nome,
                valor_unitario,
                origem
            ) VALUES (
                NEW.user_id,
                NEW.produto_nome,
                CASE 
                    WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < NEW.preco_unitario_ultimo 
                    THEN preco_geral_menor 
                    ELSE NEW.preco_unitario_ultimo 
                END,
                CASE 
                    WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < NEW.preco_unitario_ultimo 
                    THEN 'geral_prevaleceu' 
                    ELSE 'manual' 
                END
            )
            ON CONFLICT (user_id, produto_nome) 
            DO UPDATE SET 
                valor_unitario = CASE 
                    WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < NEW.preco_unitario_ultimo 
                    THEN preco_geral_menor 
                    ELSE NEW.preco_unitario_ultimo 
                END,
                origem = CASE 
                    WHEN preco_geral_menor IS NOT NULL AND preco_geral_menor < NEW.preco_unitario_ultimo 
                    THEN 'geral_prevaleceu' 
                    ELSE 'manual' 
                END,
                data_atualizacao = now(),
                updated_at = now();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Função adicional para atualizar preços quando novos preços gerais são inseridos
-- Isso permite que quando alguém insere uma nota fiscal com preço menor,
-- os preços específicos dos usuários sejam atualizados automaticamente
CREATE OR REPLACE FUNCTION public.atualizar_precos_usuario_com_geral()
RETURNS TRIGGER AS $$
DECLARE
    usuario_record RECORD;
BEGIN
    -- Quando um novo preço geral é inserido, verificar se há usuários
    -- com preços manuais maiores para o mesmo produto
    FOR usuario_record IN 
        SELECT pau.*, pau.valor_unitario as preco_usuario
        FROM precos_atuais_usuario pau
        WHERE UPPER(pau.produto_nome) = UPPER(NEW.produto_nome)
           OR UPPER(pau.produto_nome) LIKE '%' || UPPER(NEW.produto_nome) || '%'
           OR UPPER(NEW.produto_nome) LIKE '%' || UPPER(pau.produto_nome) || '%'
        AND pau.valor_unitario > NEW.valor_unitario
        AND pau.origem IN ('manual', 'geral_prevaleceu')
    LOOP
        -- Atualizar para o preço menor (da nota fiscal)
        UPDATE precos_atuais_usuario 
        SET 
            valor_unitario = NEW.valor_unitario,
            origem = 'geral_prevaleceu',
            data_atualizacao = now(),
            updated_at = now()
        WHERE id = usuario_record.id;
        
        RAISE NOTICE 'Preço atualizado para usuário %: % -> % (prevaleceu preço geral)', 
            usuario_record.user_id, usuario_record.preco_usuario, NEW.valor_unitario;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Trigger para quando novos preços gerais são inseridos
CREATE TRIGGER trigger_atualizar_precos_usuario_com_geral
AFTER INSERT ON public.precos_atuais
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_precos_usuario_com_geral();