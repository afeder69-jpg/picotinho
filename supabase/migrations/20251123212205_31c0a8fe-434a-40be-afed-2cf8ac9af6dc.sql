-- ============================================================================
-- AJUSTE: Remover COALESCE na sincronização de imagens
-- ============================================================================
-- Objetivo: Garantir que sync_candidato_aprovado() sempre use imagem_url do master,
--           mesmo que seja NULL. O trigger propagar_imagem_master() já cuida de 
--           propagar imagens adicionadas posteriormente.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_candidato_aprovado()
RETURNS TRIGGER AS $$
DECLARE
  master_details RECORD;
BEGIN
  -- Só executar se o status mudou para 'auto_aprovado' ou 'aprovado' e tem produto master vinculado
  IF NEW.status IN ('auto_aprovado', 'aprovado') 
     AND NEW.sugestao_produto_master IS NOT NULL 
     AND OLD.status NOT IN ('auto_aprovado', 'aprovado') THEN
    
    -- Buscar detalhes do produto master para atualização completa
    SELECT 
      id,
      sku_global,
      nome_padrao,
      nome_base,
      marca,
      categoria,
      imagem_url
    INTO master_details
    FROM produtos_master_global
    WHERE id = NEW.sugestao_produto_master;
    
    IF FOUND THEN
      -- Atualizar estoque vinculando ao master (usando FK direta)
      UPDATE estoque_app
      SET 
        produto_master_id = master_details.id,
        sku_global = master_details.sku_global,
        produto_nome = master_details.nome_padrao,
        produto_nome_normalizado = master_details.nome_padrao,
        nome_base = master_details.nome_base,
        marca = master_details.marca,
        categoria = LOWER(master_details.categoria),
        imagem_url = master_details.imagem_url, -- ✅ REMOVIDO COALESCE: sempre usar valor do master
        updated_at = NOW()
      WHERE produto_candidato_id = NEW.id
        AND produto_master_id IS NULL; -- Só atualizar quem ainda não tem master
      
      RAISE NOTICE '✅ Trigger: Estoque sincronizado automaticamente para candidato %', NEW.id;
    ELSE
      RAISE WARNING '⚠️ Trigger: Produto master % não encontrado para candidato %', NEW.sugestao_produto_master, NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;