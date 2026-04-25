DO $$
DECLARE
  v_user_id uuid := 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
  v_nota_ids uuid[] := ARRAY[
    '5d100c72-f33a-4c23-86f6-41f058fd0c1f'::uuid,
    '87fd3951-d76c-47f7-957e-415f30dd037a'::uuid,
    'b3bee413-21b3-4a0b-9790-5289d5aac598'::uuid
  ];
BEGIN
  DELETE FROM produtos_candidatos_normalizacao
  WHERE nota_imagem_id = ANY(v_nota_ids)
    AND usuario_id = v_user_id;

  DELETE FROM normalizacao_falhas
  WHERE nota_imagem_id = ANY(v_nota_ids);

  DELETE FROM estoque_app
  WHERE nota_id = ANY(v_nota_ids)
    AND user_id = v_user_id;

  DELETE FROM notas_imagens
  WHERE id = ANY(v_nota_ids)
    AND usuario_id = v_user_id;
END $$;