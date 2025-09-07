-- Corrigir problemas de search_path para melhorar segurança
-- Atualizando funções existentes para usar search_path seguro

-- Corrigir função de trigger
CREATE OR REPLACE FUNCTION public.sincronizar_preco_manual()
RETURNS TRIGGER AS $$
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
            -- Inserir ou atualizar preço atual específico do usuário
            INSERT INTO public.precos_atuais_usuario (
                user_id,
                produto_nome,
                valor_unitario,
                origem
            ) VALUES (
                NEW.user_id,
                NEW.produto_nome,
                NEW.preco_unitario_ultimo,
                'manual'
            )
            ON CONFLICT (user_id, produto_nome) 
            DO UPDATE SET 
                valor_unitario = NEW.preco_unitario_ultimo,
                data_atualizacao = now(),
                updated_at = now();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';