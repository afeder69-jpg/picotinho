-- =====================================================
-- ETAPA 2: RPC FUNCTIONS - MÓDULO RECEITAS
-- Picotinho App - Funções de backend
-- =====================================================

-- 1️⃣ FUNÇÃO: Buscar receitas disponíveis com base no estoque
CREATE OR REPLACE FUNCTION public.buscar_receitas_disponiveis(p_user_id UUID)
RETURNS TABLE (
  receita_id UUID,
  titulo TEXT,
  descricao TEXT,
  imagem_url TEXT,
  tempo_preparo INTEGER,
  porcoes INTEGER,
  fonte fonte_receita,
  disponibilidade tipo_disponibilidade,
  percentual_disponivel NUMERIC,
  total_ingredientes INTEGER,
  ingredientes_disponiveis INTEGER,
  ingredientes_faltantes JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH receita_analise AS (
    SELECT 
      r.id,
      r.titulo,
      r.descricao,
      r.imagem_url,
      r.tempo_preparo,
      r.porcoes,
      r.fonte,
      COUNT(ri.id) as total_ing,
      COUNT(CASE 
        WHEN e.id IS NOT NULL AND e.quantidade >= ri.quantidade THEN 1 
      END) as disponiveis,
      JSONB_AGG(
        CASE 
          WHEN e.id IS NULL OR e.quantidade < ri.quantidade THEN
            jsonb_build_object(
              'produto_nome', ri.produto_nome_busca,
              'quantidade_necessaria', ri.quantidade,
              'quantidade_disponivel', COALESCE(e.quantidade, 0),
              'unidade_medida', ri.unidade_medida
            )
        END
      ) FILTER (WHERE e.id IS NULL OR e.quantidade < ri.quantidade) as faltantes
    FROM public.receitas r
    LEFT JOIN public.receita_ingredientes ri ON ri.receita_id = r.id
    LEFT JOIN public.estoque_app e ON (
      e.user_id = p_user_id 
      AND (
        e.id = ri.produto_id 
        OR UPPER(e.produto_nome) = UPPER(ri.produto_nome_busca)
        OR UPPER(e.produto_nome) LIKE '%' || UPPER(ri.produto_nome_busca) || '%'
      )
    )
    WHERE r.user_id = p_user_id OR r.publica = TRUE OR r.fonte IN ('picotinho', 'api_externa')
    GROUP BY r.id, r.titulo, r.descricao, r.imagem_url, r.tempo_preparo, r.porcoes, r.fonte
  )
  SELECT 
    ra.id,
    ra.titulo,
    ra.descricao,
    ra.imagem_url,
    ra.tempo_preparo,
    ra.porcoes,
    ra.fonte,
    CASE 
      WHEN ra.disponiveis = ra.total_ing THEN 'completo'::tipo_disponibilidade
      WHEN ra.disponiveis > 0 THEN 'parcial'::tipo_disponibilidade
      ELSE 'faltando'::tipo_disponibilidade
    END,
    ROUND((ra.disponiveis::NUMERIC / NULLIF(ra.total_ing, 0)) * 100, 2),
    ra.total_ing,
    ra.disponiveis,
    COALESCE(ra.faltantes, '[]'::jsonb)
  FROM receita_analise ra
  ORDER BY 
    CASE 
      WHEN ra.disponiveis = ra.total_ing THEN 1
      WHEN ra.disponiveis > 0 THEN 2
      ELSE 3
    END,
    ra.disponiveis DESC,
    ra.titulo;
END;
$$;

-- 2️⃣ FUNÇÃO: Verificar disponibilidade de uma receita específica
CREATE OR REPLACE FUNCTION public.verificar_disponibilidade_receita(
  p_receita_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  disponibilidade tipo_disponibilidade,
  percentual_disponivel NUMERIC,
  ingredientes JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ingredientes_status AS (
    SELECT 
      ri.id,
      ri.produto_nome_busca,
      ri.quantidade as quantidade_necessaria,
      ri.unidade_medida,
      ri.opcional,
      COALESCE(e.quantidade, 0) as quantidade_disponivel,
      CASE 
        WHEN e.id IS NOT NULL AND e.quantidade >= ri.quantidade THEN TRUE
        ELSE FALSE
      END as disponivel
    FROM public.receita_ingredientes ri
    LEFT JOIN public.estoque_app e ON (
      e.user_id = p_user_id 
      AND (
        e.id = ri.produto_id 
        OR UPPER(e.produto_nome) = UPPER(ri.produto_nome_busca)
        OR UPPER(e.produto_nome) LIKE '%' || UPPER(ri.produto_nome_busca) || '%'
      )
    )
    WHERE ri.receita_id = p_receita_id
  ),
  contagens AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE disponivel = TRUE) as disponiveis
    FROM ingredientes_status
  )
  SELECT 
    CASE 
      WHEN c.disponiveis = c.total THEN 'completo'::tipo_disponibilidade
      WHEN c.disponiveis > 0 THEN 'parcial'::tipo_disponibilidade
      ELSE 'faltando'::tipo_disponibilidade
    END,
    ROUND((c.disponiveis::NUMERIC / NULLIF(c.total, 0)) * 100, 2),
    (
      SELECT JSONB_AGG(
        jsonb_build_object(
          'produto_nome', produto_nome_busca,
          'quantidade_necessaria', quantidade_necessaria,
          'quantidade_disponivel', quantidade_disponivel,
          'unidade_medida', unidade_medida,
          'opcional', opcional,
          'disponivel', disponivel
        )
      )
      FROM ingredientes_status
    )
  FROM contagens c;
END;
$$;

-- 3️⃣ FUNÇÃO: Criar lista de compras de uma receita
CREATE OR REPLACE FUNCTION public.criar_lista_compras_de_receita(
  p_receita_id UUID,
  p_user_id UUID,
  p_titulo TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lista_id UUID;
  v_titulo TEXT;
  v_receita_titulo TEXT;
BEGIN
  -- Buscar título da receita se não fornecido
  IF p_titulo IS NULL THEN
    SELECT titulo INTO v_receita_titulo FROM public.receitas WHERE id = p_receita_id;
    v_titulo := 'Lista: ' || v_receita_titulo;
  ELSE
    v_titulo := p_titulo;
  END IF;

  -- Criar lista
  INSERT INTO public.listas_compras (user_id, titulo, origem, receita_id)
  VALUES (p_user_id, v_titulo, 'receita', p_receita_id)
  RETURNING id INTO v_lista_id;

  -- Adicionar ingredientes faltantes
  INSERT INTO public.listas_compras_itens (
    lista_id,
    produto_id,
    produto_nome,
    quantidade,
    unidade_medida
  )
  SELECT 
    v_lista_id,
    ri.produto_id,
    ri.produto_nome_busca,
    GREATEST(ri.quantidade - COALESCE(e.quantidade, 0), 0),
    ri.unidade_medida
  FROM public.receita_ingredientes ri
  LEFT JOIN public.estoque_app e ON (
    e.user_id = p_user_id 
    AND (
      e.id = ri.produto_id 
      OR UPPER(e.produto_nome) = UPPER(ri.produto_nome_busca)
      OR UPPER(e.produto_nome) LIKE '%' || UPPER(ri.produto_nome_busca) || '%'
    )
  )
  WHERE ri.receita_id = p_receita_id
    AND (e.id IS NULL OR e.quantidade < ri.quantidade);

  RETURN v_lista_id;
END;
$$;

-- 4️⃣ FUNÇÃO: Criar lista de compras de um cardápio
CREATE OR REPLACE FUNCTION public.criar_lista_compras_de_cardapio(
  p_cardapio_id UUID,
  p_user_id UUID,
  p_titulo TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lista_id UUID;
  v_titulo TEXT;
  v_cardapio_titulo TEXT;
BEGIN
  -- Buscar título do cardápio se não fornecido
  IF p_titulo IS NULL THEN
    SELECT titulo INTO v_cardapio_titulo FROM public.cardapios WHERE id = p_cardapio_id;
    v_titulo := 'Lista: ' || v_cardapio_titulo;
  ELSE
    v_titulo := p_titulo;
  END IF;

  -- Criar lista
  INSERT INTO public.listas_compras (user_id, titulo, origem, cardapio_id)
  VALUES (p_user_id, v_titulo, 'cardapio', p_cardapio_id)
  RETURNING id INTO v_lista_id;

  -- Consolidar ingredientes de todas as receitas do cardápio
  INSERT INTO public.listas_compras_itens (
    lista_id,
    produto_id,
    produto_nome,
    quantidade,
    unidade_medida
  )
  SELECT 
    v_lista_id,
    ingredientes_consolidados.produto_id,
    ingredientes_consolidados.produto_nome,
    GREATEST(ingredientes_consolidados.total_necessario - COALESCE(e.quantidade, 0), 0),
    ingredientes_consolidados.unidade_medida
  FROM (
    SELECT 
      ri.produto_id,
      ri.produto_nome_busca as produto_nome,
      ri.unidade_medida,
      SUM(ri.quantidade) as total_necessario
    FROM public.cardapio_receitas cr
    JOIN public.receita_ingredientes ri ON ri.receita_id = cr.receita_id
    WHERE cr.cardapio_id = p_cardapio_id
    GROUP BY ri.produto_id, ri.produto_nome_busca, ri.unidade_medida
  ) ingredientes_consolidados
  LEFT JOIN public.estoque_app e ON (
    e.user_id = p_user_id 
    AND (
      e.id = ingredientes_consolidados.produto_id 
      OR UPPER(e.produto_nome) = UPPER(ingredientes_consolidados.produto_nome)
      OR UPPER(e.produto_nome) LIKE '%' || UPPER(ingredientes_consolidados.produto_nome) || '%'
    )
  )
  WHERE e.id IS NULL OR e.quantidade < ingredientes_consolidados.total_necessario;

  RETURN v_lista_id;
END;
$$;

-- 5️⃣ FUNÇÃO: Importar receita de API externa (preparação Etapa 3)
CREATE OR REPLACE FUNCTION public.importar_receita_api(
  p_user_id UUID,
  p_api_source_id TEXT,
  p_api_source_name TEXT,
  p_titulo TEXT,
  p_descricao TEXT,
  p_instrucoes TEXT,
  p_tempo_preparo INTEGER,
  p_porcoes INTEGER,
  p_imagem_url TEXT,
  p_ingredientes JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receita_id UUID;
  v_ingrediente JSONB;
BEGIN
  -- Verificar se já existe
  SELECT id INTO v_receita_id 
  FROM public.receitas 
  WHERE api_source_id = p_api_source_id 
    AND api_source_name = p_api_source_name
  LIMIT 1;

  IF v_receita_id IS NOT NULL THEN
    -- Já existe, retornar ID
    RETURN v_receita_id;
  END IF;

  -- Criar receita
  INSERT INTO public.receitas (
    user_id,
    titulo,
    descricao,
    instrucoes,
    tempo_preparo,
    porcoes,
    imagem_url,
    fonte,
    api_source_id,
    api_source_name,
    publica
  )
  VALUES (
    p_user_id,
    p_titulo,
    p_descricao,
    p_instrucoes,
    p_tempo_preparo,
    p_porcoes,
    p_imagem_url,
    'api_externa',
    p_api_source_id,
    p_api_source_name,
    FALSE
  )
  RETURNING id INTO v_receita_id;

  -- Adicionar ingredientes
  FOR v_ingrediente IN SELECT * FROM jsonb_array_elements(p_ingredientes)
  LOOP
    INSERT INTO public.receita_ingredientes (
      receita_id,
      produto_nome_busca,
      quantidade,
      unidade_medida,
      opcional
    )
    VALUES (
      v_receita_id,
      v_ingrediente->>'produto_nome',
      (v_ingrediente->>'quantidade')::NUMERIC,
      v_ingrediente->>'unidade_medida',
      COALESCE((v_ingrediente->>'opcional')::BOOLEAN, FALSE)
    );
  END LOOP;

  RETURN v_receita_id;
END;
$$;

-- ✅ ETAPA 2 CONCLUÍDA