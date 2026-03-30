
-- RPC: relatorio_compras_usuario
-- Réplica fiel da lógica do frontend Relatorios.tsx
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
  item RECORD;
  nome_estab TEXT;
  data_emissao_raw TEXT;
  data_compra_val DATE;
  item_descricao TEXT;
  item_quantidade NUMERIC;
  item_valor_unitario NUMERIC;
  item_valor_total NUMERIC;
  categoria_encontrada TEXT;
BEGIN
  FOR r IN
    SELECT ni.dados_extraidos, ni.created_at
    FROM notas_imagens ni
    WHERE ni.usuario_id = p_user_id
      AND ni.processada = true
      AND (ni.excluida = false OR ni.excluida IS NULL)
      AND ni.dados_extraidos IS NOT NULL
  LOOP
    -- Extrair nome do estabelecimento (3 fallbacks como no frontend)
    nome_estab := COALESCE(
      r.dados_extraidos->'estabelecimento'->>'nome',
      r.dados_extraidos->'supermercado'->>'nome',
      r.dados_extraidos->'emitente'->>'nome',
      'Não identificado'
    );

    -- Filtro de estabelecimento
    IF p_estabelecimento IS NOT NULL AND nome_estab NOT ILIKE '%' || p_estabelecimento || '%' THEN
      CONTINUE;
    END IF;

    -- Extrair data de emissão (DD/MM/YYYY → DATE)
    data_emissao_raw := r.dados_extraidos->'compra'->>'data_emissao';
    BEGIN
      IF data_emissao_raw IS NOT NULL AND data_emissao_raw ~ '^\d{2}/\d{2}/\d{4}' THEN
        data_compra_val := TO_DATE(SPLIT_PART(data_emissao_raw, ' ', 1), 'DD/MM/YYYY');
      ELSE
        data_compra_val := (r.created_at AT TIME ZONE 'UTC')::DATE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      data_compra_val := (r.created_at AT TIME ZONE 'UTC')::DATE;
    END;

    -- Filtro de período
    IF p_data_inicio IS NOT NULL AND data_compra_val < p_data_inicio THEN
      CONTINUE;
    END IF;
    IF p_data_fim IS NOT NULL AND data_compra_val > p_data_fim THEN
      CONTINUE;
    END IF;

    -- Iterar itens do JSONB
    FOR item IN
      SELECT value FROM jsonb_array_elements(r.dados_extraidos->'itens') AS value
    LOOP
      item_descricao := COALESCE(item.value->>'descricao', item.value->>'nome', '');
      item_quantidade := COALESCE((item.value->>'quantidade')::NUMERIC, 0);
      item_valor_unitario := COALESCE((item.value->>'valor_unitario')::NUMERIC, 0);
      item_valor_total := item_quantidade * item_valor_unitario;

      -- Pular itens sem nome ou quantidade
      IF item_descricao = '' OR item_quantidade <= 0 THEN
        CONTINUE;
      END IF;

      -- Filtro de produto
      IF p_produto IS NOT NULL AND UPPER(item_descricao) NOT LIKE '%' || UPPER(p_produto) || '%' THEN
        CONTINUE;
      END IF;

      -- Buscar categoria no estoque_app (réplica fiel do frontend)
      -- 1. Match exato UPPER
      SELECT ea.categoria INTO categoria_encontrada
      FROM estoque_app ea
      WHERE ea.user_id = p_user_id
        AND UPPER(TRIM(ea.produto_nome)) = UPPER(TRIM(item_descricao))
      LIMIT 1;

      -- 2. Match parcial bidirecional (como includes() no JS)
      IF categoria_encontrada IS NULL THEN
        SELECT ea.categoria INTO categoria_encontrada
        FROM estoque_app ea
        WHERE ea.user_id = p_user_id
          AND (
            POSITION(UPPER(TRIM(ea.produto_nome)) IN UPPER(TRIM(item_descricao))) > 0
            OR POSITION(UPPER(TRIM(item_descricao)) IN UPPER(TRIM(ea.produto_nome))) > 0
          )
        LIMIT 1;
      END IF;

      -- Default
      IF categoria_encontrada IS NULL THEN
        categoria_encontrada := 'Não categorizado';
      END IF;

      -- Filtro de categoria
      IF p_categoria IS NOT NULL AND UPPER(categoria_encontrada) <> UPPER(p_categoria) THEN
        CONTINUE;
      END IF;

      -- Retornar registro
      data_compra := data_compra_val;
      produto := item_descricao;
      categoria := categoria_encontrada;
      quantidade := item_quantidade;
      valor_unitario := item_valor_unitario;
      valor_total := item_valor_total;
      estabelecimento := nome_estab;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

-- RPC: listar_estabelecimentos_usuario
CREATE OR REPLACE FUNCTION public.listar_estabelecimentos_usuario(
  p_user_id UUID
)
RETURNS TABLE(nome TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT COALESCE(
    ni.dados_extraidos->'estabelecimento'->>'nome',
    ni.dados_extraidos->'supermercado'->>'nome',
    ni.dados_extraidos->'emitente'->>'nome',
    'Não identificado'
  ) AS nome
  FROM notas_imagens ni
  WHERE ni.usuario_id = p_user_id
    AND ni.processada = true
    AND (ni.excluida = false OR ni.excluida IS NULL)
    AND ni.dados_extraidos IS NOT NULL
  ORDER BY nome;
END;
$$;
