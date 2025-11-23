-- ========================================
-- CORREÇÃO ESTRUTURAL: Trigger de Sincronização Automática
-- ========================================
-- Garante que quando um candidato é aprovado, o estoque é automaticamente atualizado
-- Elimina o problema de produtos ficarem "pendentes" mesmo com candidatos aprovados

-- Função que sincroniza candidato aprovado com estoque
CREATE OR REPLACE FUNCTION sync_candidato_aprovado()
RETURNS TRIGGER AS $$
DECLARE
  master_details RECORD;
BEGIN
  -- Só executar se o status mudou para 'auto_aprovado' e tem produto master vinculado
  IF NEW.status = 'auto_aprovado' AND NEW.sugestao_produto_master IS NOT NULL THEN
    
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
        imagem_url = COALESCE(master_details.imagem_url, estoque_app.imagem_url),
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
$$ LANGUAGE plpgsql;

-- Criar trigger (se já existir, será substituído)
DROP TRIGGER IF EXISTS trg_sync_candidato ON produtos_candidatos_normalizacao;

CREATE TRIGGER trg_sync_candidato
AFTER UPDATE ON produtos_candidatos_normalizacao
FOR EACH ROW
WHEN (NEW.status = 'auto_aprovado' AND OLD.status != 'auto_aprovado')
EXECUTE FUNCTION sync_candidato_aprovado();

-- Comentário explicativo
COMMENT ON FUNCTION sync_candidato_aprovado() IS 
'Sincroniza automaticamente estoque_app quando um candidato de normalização é aprovado. 
Usa produto_candidato_id como FK para garantir vínculo correto (não match de string).';

COMMENT ON TRIGGER trg_sync_candidato ON produtos_candidatos_normalizacao IS 
'Garante sincronização automática entre produtos_candidatos_normalizacao (status=auto_aprovado) e estoque_app.
Resolve o problema de produtos "pendentes" que já foram aprovados mas não foram vinculados ao master.';