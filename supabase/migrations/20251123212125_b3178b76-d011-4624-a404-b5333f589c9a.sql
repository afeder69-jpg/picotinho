-- ============================================================================
-- MIGRATION: Propagação Automática de Imagens Master → Estoque
-- ============================================================================
-- Objetivo: Quando uma imagem é adicionada/atualizada em produtos_master_global,
--           propagar automaticamente para TODOS os estoque_app vinculados.
-- ============================================================================

-- 1️⃣ Criar função que propaga imagem do master para estoques vinculados
CREATE OR REPLACE FUNCTION propagar_imagem_master()
RETURNS TRIGGER AS $$
BEGIN
  -- Só executar se a imagem_url mudou
  IF OLD.imagem_url IS DISTINCT FROM NEW.imagem_url THEN
    
    -- Atualizar TODOS os estoques vinculados a este master
    UPDATE estoque_app
    SET 
      imagem_url = NEW.imagem_url,
      updated_at = NOW()
    WHERE produto_master_id = NEW.id
      AND (imagem_url IS NULL OR imagem_url != NEW.imagem_url);
    
    RAISE NOTICE '📸 Imagem propagada do master % para % itens no estoque', 
                  NEW.id, 
                  (SELECT COUNT(*) FROM estoque_app WHERE produto_master_id = NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2️⃣ Criar trigger
DROP TRIGGER IF EXISTS trg_propagar_imagem_master ON produtos_master_global;
CREATE TRIGGER trg_propagar_imagem_master
AFTER UPDATE ON produtos_master_global
FOR EACH ROW
WHEN (OLD.imagem_url IS DISTINCT FROM NEW.imagem_url)
EXECUTE FUNCTION propagar_imagem_master();

-- 3️⃣ BACKFILL: Copiar imagens existentes dos masters para estoques sem foto
UPDATE estoque_app e
SET 
  imagem_url = m.imagem_url,
  updated_at = NOW()
FROM produtos_master_global m
WHERE e.produto_master_id = m.id
  AND e.imagem_url IS NULL
  AND m.imagem_url IS NOT NULL;

-- Log de sucesso
DO $$
DECLARE
  items_updated INTEGER;
BEGIN
  SELECT COUNT(*) INTO items_updated
  FROM estoque_app e
  INNER JOIN produtos_master_global m ON e.produto_master_id = m.id
  WHERE e.imagem_url = m.imagem_url AND m.imagem_url IS NOT NULL;
  
  RAISE NOTICE '✅ Propagação de imagens configurada! % itens de estoque com imagens sincronizadas.', items_updated;
END $$;