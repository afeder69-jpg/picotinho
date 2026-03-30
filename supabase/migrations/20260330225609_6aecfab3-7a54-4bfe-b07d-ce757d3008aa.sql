-- Atualizar RPC para usar busca por palavras individuais no filtro de estabelecimento
CREATE OR REPLACE FUNCTION public.relatorio_compras_usuario(
  p_user_id UUID,
  p_data_inicio DATE DEFAULT NULL,
  p_data_fim DATE DEFAULT NULL,
  p_estabelecimento TEXT DEFAULT NULL,
  p_categoria TEXT DEFAULT NULL,
  p_produto TEXT DEFAULT NULL
)
RETURNS TABLE(
  data_compra DATE,
  produto TEXT,
  categoria TEXT,
  quantidade NUMERIC,
  valor_unitario NUMERIC,
  valor_total NUMERIC,
  estabelecimento TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  item JSONB;
  nome_estab TEXT;
  nome_estab_norm TEXT;
  data_emissao_str TEXT;
  data_compra_val DATE;
  descricao_item TEXT;
  qtd NUMERIC;
  val_unit NUMERIC;
  val_total NUMERIC;
  cat TEXT;
  p_estab_normalizado TEXT;
  p_estab_words TEXT[];
  word TEXT;
  all_words_found BOOLEAN;
BEGIN
  -- Pré-processar o parâmetro de estabelecimento
  IF p_estabelecimento IS NOT NULL THEN
    p_estab_normalizado := REGEXP_REPLACE(UPPER(p_estabelecimento), '[^A-Z0-9 ]', '', 'g');
    -- Separar em palavras individuais para busca flexível
    p_estab_words := string_to_array(TRIM(p_estab_normalizado), ' ');
    -- Remover palavras vazias
    p_estab_words := array_remove(p_estab_words, '');
  END IF;

  FOR r IN
    SELECT ni.dados_extraidos
    FROM notas_imagens ni
    WHERE ni.usuario_id = p_user_id
      AND ni.processada = true
      AND (ni.excluida = false OR ni.excluida IS NULL)
      AND ni.dados_extraidos IS NOT NULL
      AND jsonb_typeof(ni.dados_extraidos->'itens') = 'array'
  LOOP
    -- Extrair nome do estabelecimento com fallbacks (mesma lógica do frontend)
    nome_estab := COALESCE(
      r.dados_extraidos->'estabelecimento'->>'nome',
      r.dados_extraidos->'supermercado'->>'nome',
      r.dados_extraidos->'emitente'->>'nome',
      'Desconhecido'
    );

    -- Filtro de estabelecimento: cada palavra do input deve aparecer no nome normalizado
    IF p_estabelecimento IS NOT NULL THEN
      nome_estab_norm := REGEXP_REPLACE(UPPER(nome_estab), '[^A-Z0-9]', '', 'g');
      all_words_found := true;
      FOREACH word IN ARRAY p_estab_words
      LOOP
        IF POSITION(word IN nome_estab_norm) = 0 THEN
          all_words_found := false;
          EXIT;
        END IF;
      END LOOP;
      IF NOT all_words_found THEN
        CONTINUE;
      END IF;
    END IF;

    -- Extrair data de emissão
    data_emissao_str := r.dados_extraidos->'compra'->>'data_emissao';
    data_compra_val := NULL;
    IF data_emissao_str IS NOT NULL THEN
      BEGIN
        IF data_emissao_str ~ '^\d{2}/\d{2}/\d{4}' THEN
          data_compra_val := TO_DATE(SUBSTRING(data_emissao_str FROM 1 FOR 10), 'DD/MM/YYYY');
        ELSIF data_emissao_str ~ '^\d{4}-\d{2}-\d{2}' THEN
          data_compra_val := TO_DATE(SUBSTRING(data_emissao_str FROM 1 FOR 10), 'YYYY-MM-DD');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        data_compra_val := NULL;
      END;
    END IF;

    -- Filtro de período
    IF p_data_inicio IS NOT NULL AND (data_compra_val IS NULL OR data_compra_val < p_data_inicio) THEN
      CONTINUE;
    END IF;
    IF p_data_fim IS NOT NULL AND (data_compra_val IS NULL OR data_compra_val > p_data_fim) THEN
      CONTINUE;
    END IF;

    -- Iterar sobre os itens
    FOR item IN SELECT * FROM jsonb_array_elements(r.dados_extraidos->'itens')
    LOOP
      descricao_item := COALESCE(item->>'descricao', item->>'nome', 'Item sem nome');
      qtd := COALESCE((item->>'quantidade')::NUMERIC, 1);
      val_unit := COALESCE((item->>'valor_unitario')::NUMERIC, 0);
      val_total := COALESCE((item->>'valor_total')::NUMERIC, val_unit * qtd);

      IF p_produto IS NOT NULL AND UPPER(descricao_item) NOT LIKE '%' || UPPER(p_produto) || '%' THEN
        CONTINUE;
      END IF;

      SELECT ea.categoria INTO cat
      FROM estoque_app ea
      WHERE ea.user_id = p_user_id
        AND UPPER(ea.produto_nome) = UPPER(descricao_item)
      LIMIT 1;

      IF cat IS NULL THEN
        SELECT ea.categoria INTO cat
        FROM estoque_app ea
        WHERE ea.user_id = p_user_id
          AND (
            POSITION(UPPER(ea.produto_nome) IN UPPER(descricao_item)) > 0
            OR POSITION(UPPER(descricao_item) IN UPPER(ea.produto_nome)) > 0
          )
        LIMIT 1;
      END IF;

      IF cat IS NULL THEN
        cat := 'Não categorizado';
      END IF;

      IF p_categoria IS NOT NULL AND UPPER(cat) != UPPER(p_categoria) THEN
        CONTINUE;
      END IF;

      data_compra := data_compra_val;
      produto := descricao_item;
      categoria := cat;
      quantidade := qtd;
      valor_unitario := val_unit;
      valor_total := val_total;
      estabelecimento := nome_estab;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;