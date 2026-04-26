DO $$
DECLARE
  v_user_id uuid := 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
  v_total int := 0;
  v_count int;
  v_residuo int := 0;
BEGIN
  PERFORM set_config('app.allow_bulk_delete', 'on', true);
  RAISE NOTICE '=== RESET COMPLETO USER % ===', v_user_id;

  DELETE FROM precos_atuais_auditoria WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'precos_atuais_auditoria: %', v_count;

  DELETE FROM precos_atuais_contaminados_backup WHERE (dados_originais->>'user_id')::uuid = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'backup contaminados: %', v_count;

  DELETE FROM precos_atuais WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'precos_atuais: %', v_count;

  DELETE FROM precos_atuais_usuario WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'precos_atuais_usuario: %', v_count;

  DELETE FROM consumos_app WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'consumos_app: %', v_count;

  DELETE FROM estoque_app WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'estoque_app: %', v_count;

  DELETE FROM produtos_candidatos_normalizacao WHERE usuario_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'candidatos: %', v_count;

  DELETE FROM normalizacao_falhas WHERE nota_imagem_id IN (SELECT id FROM notas_imagens WHERE usuario_id = v_user_id);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'normalizacao_falhas: %', v_count;

  DELETE FROM normalizacoes_log WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'normalizacoes_log: %', v_count;

  DELETE FROM normalizacao_decisoes_log WHERE decidido_por = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'decisoes_log: %', v_count;

  DELETE FROM produtos WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'produtos legado: %', v_count;

  DELETE FROM notas WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'notas: %', v_count;

  DELETE FROM notas_imagens WHERE usuario_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'notas_imagens: %', v_count;

  DELETE FROM listas_compras_itens WHERE lista_id IN (SELECT id FROM listas_compras WHERE user_id = v_user_id);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'listas_itens: %', v_count;

  DELETE FROM listas_compras WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'listas_compras: %', v_count;

  DELETE FROM cardapio_receitas WHERE cardapio_id IN (SELECT id FROM cardapios WHERE user_id = v_user_id);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'cardapio_receitas: %', v_count;

  DELETE FROM cardapios WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'cardapios: %', v_count;

  -- Receitas e relacionados
  BEGIN EXECUTE 'DELETE FROM receitas_ingredientes WHERE receita_id IN (SELECT id FROM receitas WHERE user_id = $1)' USING v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'receitas_ingredientes: %', v_count;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  DELETE FROM receitas_avaliacoes WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'receitas_avaliacoes: %', v_count;

  DELETE FROM receitas WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'receitas: %', v_count;

  DELETE FROM mercados WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'mercados: %', v_count;

  DELETE FROM feedbacks_respostas WHERE feedback_id IN (SELECT id FROM feedbacks WHERE user_id = v_user_id);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'feedbacks_respostas: %', v_count;

  DELETE FROM feedbacks WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'feedbacks: %', v_count;

  DELETE FROM usuarios_pontos_log WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'pontos_log: %', v_count;

  DELETE FROM usuarios_pontos WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'pontos: %', v_count;

  -- WhatsApp (coluna correta = usuario_id)
  DELETE FROM whatsapp_mensagens WHERE usuario_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'wa_mensagens: %', v_count;

  DELETE FROM whatsapp_sessions WHERE usuario_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'wa_sessions: %', v_count;

  DELETE FROM whatsapp_telefones_autorizados WHERE usuario_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'wa_telefones: %', v_count;

  DELETE FROM whatsapp_preferencias_usuario WHERE usuario_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'wa_pref: %', v_count;

  DELETE FROM whatsapp_configuracoes WHERE usuario_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'wa_config: %', v_count;

  DELETE FROM campanhas_whatsapp_envios WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'camp_envios: %', v_count;

  DELETE FROM campanhas_whatsapp_respostas WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'camp_respostas: %', v_count;

  DELETE FROM profile_access_log WHERE user_id = v_user_id OR accessed_user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'access_log: %', v_count;

  DELETE FROM profile_security_log WHERE user_id = v_user_id OR target_user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'security_log: %', v_count;

  DELETE FROM configuracoes_usuario WHERE usuario_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count; RAISE NOTICE 'config_usuario: %', v_count;

  RAISE NOTICE '=== TOTAL APAGADO: % ===', v_total;

  -- VALIDAÇÃO
  SELECT count(*) INTO v_count FROM notas_imagens WHERE usuario_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM notas WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM estoque_app WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM precos_atuais WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM precos_atuais_usuario WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM produtos_candidatos_normalizacao WHERE usuario_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM listas_compras WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM mercados WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM feedbacks WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM configuracoes_usuario WHERE usuario_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM precos_atuais_auditoria WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM precos_atuais_contaminados_backup WHERE (dados_originais->>'user_id')::uuid = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM whatsapp_mensagens WHERE usuario_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM whatsapp_telefones_autorizados WHERE usuario_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM receitas WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM cardapios WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;
  SELECT count(*) INTO v_count FROM usuarios_pontos WHERE user_id = v_user_id; v_residuo := v_residuo + v_count;

  IF v_residuo > 0 THEN
    RAISE EXCEPTION 'RESET INCOMPLETO! Restam % registros. Rollback.', v_residuo;
  END IF;

  SELECT count(*) INTO v_count FROM profiles WHERE user_id = v_user_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'profile removido indevidamente! Rollback.'; END IF;

  RAISE NOTICE '=== ✅ RESET DB COMPLETO. profile preservado. ===';
END $$;