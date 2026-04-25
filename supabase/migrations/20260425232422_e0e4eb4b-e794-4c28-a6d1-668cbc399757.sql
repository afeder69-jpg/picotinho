-- Limpeza segura das 3 notas pendentes do usuário ae5b5501-fb22-4a52-a048-fbb37e3a5ddd
DO $$
DECLARE
  v_user_id uuid := 'ae5b5501-fb22-4a52-a048-fbb37e3a5ddd';
  v_nota_ids uuid[] := ARRAY[
    '5d100c72-f33a-4c23-86f6-41f058fd0c1f'::uuid,
    '87fd3951-d76c-47f7-957e-415f30dd037a'::uuid,
    'b3bee413-21b3-4a0b-9790-5289d5aac598'::uuid
  ];
BEGIN
  -- 1. Candidatos de normalização vinculados às notas
  DELETE FROM produtos_candidatos_normalizacao
  WHERE nota_imagem_id = ANY(v_nota_ids)
    AND usuario_id = v_user_id;

  -- 2. Falhas de normalização vinculadas às notas
  DELETE FROM normalizacao_falhas
  WHERE nota_imagem_id = ANY(v_nota_ids);

  -- 3. Estoque residual (deve ser 0, mas garante limpeza)
  DELETE FROM estoque_app
  WHERE nota_id = ANY(v_nota_ids)
    AND user_id = v_user_id;

  -- 4. Por fim, as próprias notas (filtrado por usuario_id por segurança)
  DELETE FROM notas_imagens
  WHERE id = ANY(v_nota_ids)
    AND usuario_id = v_user_id;
END $$;