
-- Backfill: sincronizar produto_nome e produto_nome_normalizado do estoque_app
-- com nome_padrao do master para todos os 111 registros divergentes
UPDATE estoque_app e
SET produto_nome = m.nome_padrao,
    produto_nome_normalizado = m.nome_padrao,
    updated_at = now()
FROM produtos_master_global m
WHERE e.produto_master_id = m.id
  AND e.produto_nome != m.nome_padrao
  AND m.status = 'ativo';
