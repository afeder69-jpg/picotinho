-- Fase 3 (escopo restrito): vincular 3 órfãos específicos por EAN aos masters corretos
-- IDs travados explicitamente para evitar qualquer ampliação de escopo
WITH alvos AS (
  SELECT * FROM (VALUES
    ('578b1340-b5a6-4d3c-9c90-4a333f809542'::uuid, 'f3127e25-1ce1-4d5c-b8b4-dc12f704d45a'::uuid),
    ('d4b47dff-665d-4b62-9d60-48b11d855cf9'::uuid, 'f3127e25-1ce1-4d5c-b8b4-dc12f704d45a'::uuid),
    ('6f8dffff-c2bd-4330-a2b4-0ce96c7fd7f4'::uuid, '00817c1a-a460-43fb-b50b-5b2b475af1cb'::uuid)
  ) AS t(orfao_id, master_id)
)
UPDATE estoque_app e
SET
  produto_master_id = a.master_id,
  sku_global = m.sku_global,
  produto_nome = m.nome_padrao,
  produto_nome_normalizado = m.nome_padrao,
  nome_base = m.nome_base,
  marca = m.marca,
  categoria = LOWER(COALESCE(m.categoria, 'OUTROS')),
  imagem_url = COALESCE(m.imagem_url, e.imagem_url),
  updated_at = now()
FROM alvos a
JOIN produtos_master_global m ON m.id = a.master_id
WHERE e.id = a.orfao_id
  AND e.produto_master_id IS NULL  -- trava extra: só atualiza se ainda for órfão
  AND m.status = 'ativo';