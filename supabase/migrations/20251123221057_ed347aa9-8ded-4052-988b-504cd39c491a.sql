-- ============================================
-- CORREÇÃO COMPLETA: Imagens Faltando no Estoque
-- ============================================

-- 1. BACKFILL IMEDIATO: Copiar imagens do master para estoque existente
UPDATE estoque_app e
SET 
  imagem_url = m.imagem_url,
  updated_at = now()
FROM produtos_master_global m
WHERE e.produto_master_id = m.id
  AND e.imagem_url IS NULL
  AND m.imagem_url IS NOT NULL;

-- 2. RECRIAR TRIGGER sync_candidato_aprovado() SEM CONDIÇÃO BLOQUEANTE
DROP TRIGGER IF EXISTS trg_sync_candidato ON produtos_candidatos_normalizacao;
DROP FUNCTION IF EXISTS sync_candidato_aprovado();

CREATE OR REPLACE FUNCTION sync_candidato_aprovado()
RETURNS TRIGGER AS $$
BEGIN
  -- Sincronizar SEMPRE que candidato for aprovado (auto ou manual)
  -- REMOVER condição "AND produto_master_id IS NULL" que bloqueava atualizações
  IF NEW.status IN ('auto_aprovado', 'aprovado') AND NEW.sugestao_produto_master IS NOT NULL THEN
    UPDATE estoque_app
    SET 
      produto_master_id = NEW.sugestao_produto_master,
      sku_global = (SELECT sku_global FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      produto_nome_normalizado = (SELECT nome_padrao FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      nome_base = (SELECT nome_base FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      marca = COALESCE((SELECT marca FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.marca),
      categoria = (SELECT categoria FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      imagem_url = (SELECT imagem_url FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      granel = COALESCE((SELECT granel FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.granel),
      tipo_embalagem = COALESCE((SELECT tipo_embalagem FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.tipo_embalagem),
      qtd_valor = COALESCE((SELECT qtd_valor FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.qtd_valor),
      qtd_unidade = COALESCE((SELECT qtd_unidade FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.qtd_unidade),
      qtd_base = COALESCE((SELECT qtd_base FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.qtd_base),
      unidade_base = COALESCE((SELECT unidade_base FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.unidade_base),
      updated_at = now()
    WHERE produto_candidato_id = NEW.id;
    
    RAISE NOTICE 'Estoque sincronizado com master para candidato %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_sync_candidato
AFTER UPDATE ON produtos_candidatos_normalizacao
FOR EACH ROW
EXECUTE FUNCTION sync_candidato_aprovado();

-- 3. RECRIAR TRIGGER trg_propagar_imagem_master PARA PROPAGAÇÃO AUTOMÁTICA
DROP TRIGGER IF EXISTS trg_propagar_imagem_master ON produtos_master_global;
DROP FUNCTION IF EXISTS propagar_imagem_master();

CREATE OR REPLACE FUNCTION propagar_imagem_master()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando imagem é adicionada/atualizada no master, propagar para estoque
  IF NEW.imagem_url IS DISTINCT FROM OLD.imagem_url AND NEW.imagem_url IS NOT NULL THEN
    UPDATE estoque_app
    SET 
      imagem_url = NEW.imagem_url,
      updated_at = now()
    WHERE produto_master_id = NEW.id;
    
    RAISE NOTICE 'Imagem propagada do master % para % produtos no estoque', NEW.id, (SELECT COUNT(*) FROM estoque_app WHERE produto_master_id = NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_propagar_imagem_master
AFTER UPDATE ON produtos_master_global
FOR EACH ROW
EXECUTE FUNCTION propagar_imagem_master();

-- 4. LOG DE RESULTADOS DO BACKFILL
DO $$
DECLARE
  total_corrigido INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_corrigido
  FROM estoque_app e
  JOIN produtos_master_global m ON e.produto_master_id = m.id
  WHERE e.imagem_url = m.imagem_url AND m.imagem_url IS NOT NULL;
  
  RAISE NOTICE '✅ BACKFILL CONCLUÍDO: % produtos corrigidos com imagens', total_corrigido;
END $$;