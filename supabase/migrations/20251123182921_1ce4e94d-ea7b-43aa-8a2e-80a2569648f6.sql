-- PARTE 3: Sincronizar produtos órfãos (candidatos aprovados mas estoque não atualizado)
-- Não atualizar categoria pois pode haver incompatibilidade de formato
UPDATE estoque_app e
SET 
  produto_master_id = pm.id,
  produto_nome_normalizado = pm.nome_padrao,
  sku_global = pm.sku_global,
  nome_base = pm.nome_base,
  marca = pm.marca,
  tipo_embalagem = pm.tipo_embalagem,
  qtd_valor = pm.qtd_valor,
  qtd_unidade = pm.qtd_unidade,
  produto_candidato_id = NULL,
  updated_at = now()
FROM produtos_candidatos_normalizacao pc
JOIN produtos_master_global pm ON pm.id = pc.sugestao_produto_master
WHERE 
  e.produto_candidato_id = pc.id
  AND e.produto_master_id IS NULL
  AND pc.status = 'aprovado'
  AND pc.sugestao_produto_master IS NOT NULL;

-- PARTE 4: Melhorar trigger para cobrir aprovações manuais (status 'aprovado')
DROP TRIGGER IF EXISTS trg_sync_candidato ON produtos_candidatos_normalizacao;

CREATE TRIGGER trg_sync_candidato
AFTER UPDATE ON produtos_candidatos_normalizacao
FOR EACH ROW
WHEN (NEW.status IN ('auto_aprovado', 'aprovado') 
      AND OLD.status NOT IN ('auto_aprovado', 'aprovado')
      AND NEW.sugestao_produto_master IS NOT NULL)
EXECUTE FUNCTION sync_candidato_aprovado();