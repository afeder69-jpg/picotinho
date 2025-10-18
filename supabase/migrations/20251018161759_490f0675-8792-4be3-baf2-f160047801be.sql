-- =====================================
-- FASE 3: TRIGGER PARA CORREÇÃO RETROATIVA
-- =====================================

-- Função que será chamada pelo trigger quando candidato for aprovado
CREATE OR REPLACE FUNCTION atualizar_estoque_apos_aprovacao_candidato()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  master_record RECORD;
  produtos_atualizados INT := 0;
BEGIN
  -- Só executar se status mudou para 'aprovado' e tem master vinculado
  IF NEW.status = 'aprovado' AND 
     NEW.sugestao_produto_master IS NOT NULL AND
     (OLD.status IS NULL OR OLD.status != 'aprovado') THEN
    
    -- Buscar dados do master aprovado
    SELECT * INTO master_record
    FROM produtos_master_global
    WHERE id = NEW.sugestao_produto_master;
    
    IF FOUND THEN
      -- Atualizar estoque com fuzzy match (threshold 80%)
      UPDATE estoque_app
      SET 
        sku_global = master_record.sku_global,
        produto_master_id = master_record.id,
        produto_nome = master_record.nome_padrao,
        marca = master_record.marca,
        categoria = master_record.categoria,
        produto_nome_normalizado = master_record.nome_padrao,
        nome_base = master_record.nome_base,
        updated_at = now()
      WHERE 
        sku_global IS NULL
        AND categoria = master_record.categoria
        AND (
          -- Fuzzy match: nome similar ao texto original ou nome padrao
          similarity(UPPER(produto_nome), UPPER(NEW.texto_original)) > 0.80
          OR similarity(UPPER(produto_nome), UPPER(master_record.nome_padrao)) > 0.80
        );
      
      GET DIAGNOSTICS produtos_atualizados = ROW_COUNT;
      
      RAISE NOTICE '✅ Trigger: % produtos atualizados para master % (SKU: %)', 
        produtos_atualizados, 
        master_record.nome_padrao,
        master_record.sku_global;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 🛡️ FALLBACK: Log erro mas não falha a transação
    RAISE WARNING '⚠️ Erro no trigger de atualização de estoque: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trigger_atualizar_estoque_apos_aprovacao 
ON produtos_candidatos_normalizacao;

-- Criar trigger
CREATE TRIGGER trigger_atualizar_estoque_apos_aprovacao
AFTER UPDATE ON produtos_candidatos_normalizacao
FOR EACH ROW
EXECUTE FUNCTION atualizar_estoque_apos_aprovacao_candidato();

-- Comentário explicativo
COMMENT ON FUNCTION atualizar_estoque_apos_aprovacao_candidato IS 
  'Atualiza automaticamente o estoque quando um candidato é aprovado, vinculando produtos ao master correspondente';

-- Log de sucesso
DO $$
BEGIN
  RAISE NOTICE '✅ Trigger de correção retroativa criado com sucesso';
  RAISE NOTICE '🔔 Agora quando você aprovar candidatos, o estoque será atualizado automaticamente';
END $$;