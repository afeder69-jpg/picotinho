-- PARTE 1: Sincronizar os 3 produtos órfãos existentes (imagem_url ausente no estoque)
UPDATE estoque_app e
SET 
  imagem_url = pm.imagem_url,
  updated_at = now()
FROM produtos_master_global pm
WHERE 
  e.produto_master_id = pm.id
  AND pm.imagem_url IS NOT NULL
  AND e.imagem_url IS NULL;

-- PARTE 3: Criar trigger para propagar atualizações de imagem_url do master para estoques vinculados
CREATE OR REPLACE FUNCTION sync_master_imagem_to_estoque()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando imagem_url é adicionada ou atualizada em produtos_master_global,
  -- propagar para todos os estoque_app vinculados
  IF NEW.imagem_url IS DISTINCT FROM OLD.imagem_url THEN
    UPDATE estoque_app
    SET 
      imagem_url = NEW.imagem_url,
      updated_at = now()
    WHERE produto_master_id = NEW.id;
    
    RAISE NOTICE 'Imagem do master % propagada para % registros de estoque', NEW.id, (SELECT COUNT(*) FROM estoque_app WHERE produto_master_id = NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_master_imagem ON produtos_master_global;

CREATE TRIGGER trg_sync_master_imagem
AFTER UPDATE ON produtos_master_global
FOR EACH ROW
WHEN (NEW.imagem_url IS DISTINCT FROM OLD.imagem_url)
EXECUTE FUNCTION sync_master_imagem_to_estoque();