-- Função para corrigir produtos manuais sem preço definido
-- usando valores de referência da tabela precos_atuais
CREATE OR REPLACE FUNCTION public.corrigir_produtos_manuais_sem_preco()
RETURNS TABLE(
  produto_id uuid,
  produto_nome text,
  quantidade numeric,
  preco_sugerido numeric,
  acao_realizada text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    produto_record RECORD;
    preco_referencia RECORD;
    novo_preco NUMERIC;
BEGIN
    -- Buscar produtos inseridos manualmente sem preço definido
    FOR produto_record IN 
        SELECT 
            e.id,
            e.produto_nome,
            e.quantidade,
            e.preco_unitario_ultimo,
            e.user_id
        FROM estoque_app e
        WHERE (e.preco_unitario_ultimo IS NULL OR e.preco_unitario_ultimo = 0)
        AND NOT EXISTS (
            SELECT 1 FROM notas_imagens ni 
            WHERE ni.dados_extraidos::text LIKE '%' || e.produto_nome || '%'
            AND ni.processada = true
            AND ni.usuario_id = e.user_id
        )
    LOOP
        -- Tentar encontrar preço de referência na tabela precos_atuais
        SELECT INTO preco_referencia
            valor_unitario
        FROM precos_atuais pa
        WHERE UPPER(pa.produto_nome) = produto_record.produto_nome
           OR UPPER(pa.produto_nome) LIKE '%' || produto_record.produto_nome || '%'
           OR produto_record.produto_nome LIKE '%' || UPPER(pa.produto_nome) || '%'
        ORDER BY pa.data_atualizacao DESC
        LIMIT 1;
        
        IF FOUND THEN
            novo_preco := preco_referencia.valor_unitario;
            
            -- Atualizar o produto com o preço de referência
            UPDATE estoque_app 
            SET preco_unitario_ultimo = novo_preco,
                updated_at = now()
            WHERE id = produto_record.id;
            
            -- Retornar resultado da correção
            RETURN QUERY SELECT 
                produto_record.id,
                produto_record.produto_nome::text,
                produto_record.quantidade,
                novo_preco,
                'Preço corrigido com valor de referência'::text;
        ELSE
            -- Produto sem referência de preço - retornar para correção manual
            RETURN QUERY SELECT 
                produto_record.id,
                produto_record.produto_nome::text,
                produto_record.quantidade,
                0.0::numeric,
                'Requer correção manual - sem preço de referência'::text;
        END IF;
    END LOOP;
    
    RETURN;
END;
$function$;