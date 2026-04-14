
DO $$
DECLARE
  v_master_preservado uuid := '4267658d-fcc9-4fd2-be04-ffaa1fcb1e88';
  v_master_duplicado uuid := '19f7752f-5285-4c90-9536-501840f9e82f';
  v_sku_duplicado text;
  v_notas_duplicado int;
  v_count int;
BEGIN
  -- Buscar dados do duplicado
  SELECT sku_global, COALESCE(total_notas, 0) INTO v_sku_duplicado, v_notas_duplicado
  FROM produtos_master_global WHERE id = v_master_duplicado;

  IF v_sku_duplicado IS NULL THEN
    RAISE EXCEPTION 'Master duplicado não encontrado';
  END IF;

  -- 1. Migrar precos_atuais
  UPDATE precos_atuais SET produto_master_id = v_master_preservado
  WHERE produto_master_id = v_master_duplicado;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'precos_atuais: %', v_count;

  -- 2. Migrar estoque_app
  UPDATE estoque_app SET produto_master_id = v_master_preservado
  WHERE produto_master_id = v_master_duplicado;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'estoque_app: %', v_count;

  -- 3. Migrar candidatos
  UPDATE produtos_candidatos_normalizacao SET sugestao_produto_master = v_master_preservado
  WHERE sugestao_produto_master = v_master_duplicado;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'candidatos: %', v_count;

  -- 4. Migrar listas
  UPDATE listas_compras_itens SET produto_id = v_master_preservado
  WHERE produto_id = v_master_duplicado;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'listas: %', v_count;

  -- 5. Criar sinônimo do SKU duplicado
  INSERT INTO produtos_sinonimos_globais (produto_master_id, texto_variacao, fonte, confianca, aprovado_em)
  VALUES (v_master_preservado, v_sku_duplicado, 'consolidacao_manual_feijao', 100, now())
  ON CONFLICT DO NOTHING;

  -- 6. Migrar sinônimos existentes
  UPDATE produtos_sinonimos_globais SET produto_master_id = v_master_preservado
  WHERE produto_master_id = v_master_duplicado;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'sinonimos: %', v_count;

  -- 7. Somar total_notas
  UPDATE produtos_master_global
  SET total_notas = COALESCE(total_notas, 0) + v_notas_duplicado
  WHERE id = v_master_preservado;

  -- 8. Remover duplicado
  DELETE FROM produtos_master_global WHERE id = v_master_duplicado;
  RAISE NOTICE 'Master duplicado removido. SKU antigo: %', v_sku_duplicado;
END $$;
