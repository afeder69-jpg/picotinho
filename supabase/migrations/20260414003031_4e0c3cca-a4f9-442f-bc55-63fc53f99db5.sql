
-- PRIORIDADE 1: Match exato por nome normalizado contra catálogo master
UPDATE precos_atuais pa
SET produto_master_id = sub.master_id
FROM (
  SELECT pa2.id as preco_id, pmg.id as master_id
  FROM precos_atuais pa2
  JOIN produtos_master_global pmg 
    ON UPPER(TRIM(pa2.produto_nome)) = pmg.nome_padrao
  WHERE pa2.produto_master_id IS NULL
  AND (SELECT COUNT(*) FROM produtos_master_global pmg2 
       WHERE pmg2.nome_padrao = UPPER(TRIM(pa2.produto_nome))) = 1
) sub
WHERE pa.id = sub.preco_id;

-- PRIORIDADE 2: Via candidatos de normalização já aprovados
UPDATE precos_atuais pa
SET produto_master_id = sub.master_id
FROM (
  SELECT DISTINCT pa2.id as preco_id, pcn.sugestao_produto_master as master_id
  FROM precos_atuais pa2
  JOIN produtos_candidatos_normalizacao pcn 
    ON UPPER(TRIM(pa2.produto_nome)) = UPPER(TRIM(pcn.texto_original))
  WHERE pa2.produto_master_id IS NULL
    AND pcn.sugestao_produto_master IS NOT NULL
    AND pcn.status IN ('auto_aprovado', 'aprovado')
    AND (SELECT COUNT(DISTINCT pcn2.sugestao_produto_master) 
         FROM produtos_candidatos_normalizacao pcn2
         WHERE UPPER(TRIM(pcn2.texto_original)) = UPPER(TRIM(pa2.produto_nome))
           AND pcn2.sugestao_produto_master IS NOT NULL
           AND pcn2.status IN ('auto_aprovado', 'aprovado')) = 1
) sub
WHERE pa.id = sub.preco_id;

-- PRIORIDADE 3: Via estoque_app (mesmo user_id + mesmo nome de produto)
UPDATE precos_atuais pa
SET produto_master_id = sub.master_id
FROM (
  SELECT pa2.id as preco_id, MIN(ea.produto_master_id::text)::uuid as master_id
  FROM precos_atuais pa2
  JOIN estoque_app ea 
    ON UPPER(TRIM(pa2.produto_nome)) = UPPER(TRIM(ea.produto_nome))
    AND pa2.user_id = ea.user_id
  WHERE pa2.produto_master_id IS NULL
    AND ea.produto_master_id IS NOT NULL
  GROUP BY pa2.id
  HAVING COUNT(DISTINCT ea.produto_master_id) = 1
) sub
WHERE pa.id = sub.preco_id;
