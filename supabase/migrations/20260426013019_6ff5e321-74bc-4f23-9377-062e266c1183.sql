-- ============================================
-- FRENTE 2 - FASE A: Limpeza de Alta Confiança
-- Job de referência: 318ad279-b700-4175-887e-370a230d90cb
-- ============================================

-- 1. Identificar IDs alvo (nota_sem_item + replicacao>=3 + EAN no master + sem match ±7d)
WITH job AS (
  SELECT '318ad279-b700-4175-887e-370a230d90cb'::uuid AS id
),
candidatos AS (
  SELECT a.preco_atual_id, a.estabelecimento_cnpj, a.valor_unitario, 
         a.data_atualizacao::date AS data_ref,
         (a.evidencia->>'ean_master') AS ean_master
  FROM precos_atuais_auditoria a, job
  WHERE a.job_id = job.id
    AND a.classificacao = 'suspeito'
    AND a.motivo = 'nota_sem_item'
    AND a.replicacao_count >= 3
    AND (a.evidencia->>'ean_master') IS NOT NULL
    AND length(a.evidencia->>'ean_master') >= 8
),
sem_match_7d AS (
  SELECT c.preco_atual_id
  FROM candidatos c
  WHERE NOT EXISTS (
    SELECT 1 FROM notas_imagens n,
         jsonb_array_elements(n.dados_extraidos->'itens') it
    WHERE n.excluida = false
      AND regexp_replace(COALESCE(n.dados_extraidos->'estabelecimento'->>'cnpj',''),'\D','','g')
          = regexp_replace(c.estabelecimento_cnpj,'\D','','g')
      AND n.data_criacao::date BETWEEN c.data_ref - 7 AND c.data_ref + 7
      AND it->>'codigo_barras' = c.ean_master
      AND ABS((it->>'valor_unitario')::numeric - c.valor_unitario) <= 0.05
  )
)
-- 2. Backup completo antes de deletar
INSERT INTO precos_atuais_contaminados_backup
  (preco_atual_id, dados_originais, motivo_remocao, audit_run_id)
SELECT 
  pa.id,
  to_jsonb(pa.*),
  'fase_A_nota_sem_item_replicacao>=3_ean_master_sem_match_7d',
  '318ad279-b700-4175-887e-370a230d90cb'
FROM precos_atuais pa
WHERE pa.id IN (SELECT preco_atual_id FROM sem_match_7d)
  AND NOT EXISTS (
    SELECT 1 FROM precos_atuais_contaminados_backup b
    WHERE b.preco_atual_id = pa.id AND b.restaurado = false
  );

-- 3. DELETE seletivo (Fase A)
WITH job AS (
  SELECT '318ad279-b700-4175-887e-370a230d90cb'::uuid AS id
),
candidatos AS (
  SELECT a.preco_atual_id, a.estabelecimento_cnpj, a.valor_unitario,
         a.data_atualizacao::date AS data_ref,
         (a.evidencia->>'ean_master') AS ean_master
  FROM precos_atuais_auditoria a, job
  WHERE a.job_id = job.id
    AND a.classificacao = 'suspeito'
    AND a.motivo = 'nota_sem_item'
    AND a.replicacao_count >= 3
    AND (a.evidencia->>'ean_master') IS NOT NULL
    AND length(a.evidencia->>'ean_master') >= 8
),
sem_match_7d AS (
  SELECT c.preco_atual_id
  FROM candidatos c
  WHERE NOT EXISTS (
    SELECT 1 FROM notas_imagens n,
         jsonb_array_elements(n.dados_extraidos->'itens') it
    WHERE n.excluida = false
      AND regexp_replace(COALESCE(n.dados_extraidos->'estabelecimento'->>'cnpj',''),'\D','','g')
          = regexp_replace(c.estabelecimento_cnpj,'\D','','g')
      AND n.data_criacao::date BETWEEN c.data_ref - 7 AND c.data_ref + 7
      AND it->>'codigo_barras' = c.ean_master
      AND ABS((it->>'valor_unitario')::numeric - c.valor_unitario) <= 0.05
  )
)
DELETE FROM precos_atuais
WHERE id IN (SELECT preco_atual_id FROM sem_match_7d);