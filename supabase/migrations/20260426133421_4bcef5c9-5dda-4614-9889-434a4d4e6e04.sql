DO $$
DECLARE
  v_job_id uuid := '123327f8-1515-4fa2-9887-b06bbebe901a';
  v_backup_count int;
  v_delete_count int;
BEGIN
  -- Backup
  WITH candidatos AS (
    SELECT preco_atual_id
    FROM precos_atuais_auditoria
    WHERE job_id = v_job_id
      AND classificacao = 'suspeito'
      AND motivo IN ('nota_sem_item','master_invalido')
      AND COALESCE(replicacao_count, 0) >= 3
  )
  INSERT INTO precos_atuais_contaminados_backup (
    preco_atual_id, dados_originais, motivo_remocao, audit_run_id, removido_em, restaurado
  )
  SELECT pa.id, to_jsonb(pa.*), 'fase_a_corrigida_v2', v_job_id, now(), false
  FROM precos_atuais pa
  INNER JOIN candidatos c ON c.preco_atual_id = pa.id;

  GET DIAGNOSTICS v_backup_count = ROW_COUNT;
  RAISE NOTICE 'Backup: % registros', v_backup_count;

  -- DELETE
  WITH candidatos AS (
    SELECT preco_atual_id
    FROM precos_atuais_auditoria
    WHERE job_id = v_job_id
      AND classificacao = 'suspeito'
      AND motivo IN ('nota_sem_item','master_invalido')
      AND COALESCE(replicacao_count, 0) >= 3
  )
  DELETE FROM precos_atuais
  WHERE id IN (SELECT preco_atual_id FROM candidatos);

  GET DIAGNOSTICS v_delete_count = ROW_COUNT;
  RAISE NOTICE 'Removidos: % registros', v_delete_count;

  -- Tolerância: aceita até 5 registros de diferença
  IF ABS(v_backup_count - v_delete_count) > 5 THEN
    RAISE EXCEPTION 'Inconsistência grande: backup=% delete=%', v_backup_count, v_delete_count;
  END IF;
END $$;