-- FASE 2: Adicionar coluna area na tabela receitas
ALTER TABLE public.receitas 
ADD COLUMN IF NOT EXISTS area TEXT;

-- Adicionar índice para buscas por área
CREATE INDEX IF NOT EXISTS idx_receitas_area ON public.receitas(area);

-- FASE 5: Remover função antiga se existir e criar nova
DROP FUNCTION IF EXISTS public.verificar_disponibilidade_receita(UUID);

CREATE OR REPLACE FUNCTION public.verificar_disponibilidade_receita(receita_uuid UUID)
RETURNS TABLE(
  ingrediente_nome TEXT,
  quantidade_necessaria TEXT,
  disponivel BOOLEAN,
  quantidade_estoque NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ri.produto_nome_busca,
    ri.quantidade,
    CASE 
      WHEN e.id IS NOT NULL THEN true
      ELSE false
    END as disponivel,
    COALESCE(e.quantidade, 0) as quantidade_estoque
  FROM receita_ingredientes ri
  LEFT JOIN estoque_app e ON (
    e.user_id = auth.uid() AND
    (
      UPPER(TRIM(e.produto_nome)) = UPPER(TRIM(ri.produto_nome_busca)) OR
      UPPER(TRIM(e.produto_nome)) LIKE '%' || UPPER(TRIM(ri.produto_nome_busca)) || '%' OR
      UPPER(TRIM(ri.produto_nome_busca)) LIKE '%' || UPPER(TRIM(e.produto_nome)) || '%' OR
      similarity(UPPER(e.produto_nome), UPPER(ri.produto_nome_busca)) > 0.6
    )
  )
  WHERE ri.receita_id = receita_uuid
  ORDER BY ri.produto_nome_busca;
END;
$$;

-- FASE 5: Criar função RPC para gerar lista de compras de uma receita
DROP FUNCTION IF EXISTS public.criar_lista_compras_de_receita(UUID);

CREATE OR REPLACE FUNCTION public.criar_lista_compras_de_receita(receita_uuid UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nova_lista_id UUID;
  receita_titulo TEXT;
  ingrediente_record RECORD;
BEGIN
  -- Obter título da receita
  SELECT titulo INTO receita_titulo FROM receitas WHERE id = receita_uuid;
  
  -- Criar lista de compras
  INSERT INTO listas_compras (user_id, titulo, origem, receita_id)
  VALUES (auth.uid(), 'Lista: ' || receita_titulo, 'receita', receita_uuid)
  RETURNING id INTO nova_lista_id;
  
  -- Inserir ingredientes faltantes
  FOR ingrediente_record IN
    SELECT 
      ri.produto_nome_busca,
      ri.quantidade,
      ri.unidade_medida
    FROM receita_ingredientes ri
    WHERE ri.receita_id = receita_uuid
    AND NOT EXISTS (
      SELECT 1 FROM estoque_app e 
      WHERE e.user_id = auth.uid() 
      AND (
        UPPER(TRIM(e.produto_nome)) = UPPER(TRIM(ri.produto_nome_busca)) OR
        UPPER(TRIM(e.produto_nome)) LIKE '%' || UPPER(TRIM(ri.produto_nome_busca)) || '%' OR
        similarity(UPPER(e.produto_nome), UPPER(ri.produto_nome_busca)) > 0.6
      )
    )
  LOOP
    INSERT INTO listas_compras_itens (
      lista_id,
      produto_nome,
      quantidade,
      unidade_medida
    ) VALUES (
      nova_lista_id,
      ingrediente_record.produto_nome_busca,
      COALESCE(ingrediente_record.quantidade::numeric, 1),
      COALESCE(ingrediente_record.unidade_medida, 'un')
    );
  END LOOP;
  
  RETURN nova_lista_id;
END;
$$;

-- FASE 5: Criar função RPC para gerar lista de compras de um cardápio
DROP FUNCTION IF EXISTS public.criar_lista_compras_de_cardapio(UUID);

CREATE OR REPLACE FUNCTION public.criar_lista_compras_de_cardapio(cardapio_uuid UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nova_lista_id UUID;
  cardapio_titulo TEXT;
  ingrediente_record RECORD;
BEGIN
  -- Obter título do cardápio
  SELECT titulo INTO cardapio_titulo FROM cardapios WHERE id = cardapio_uuid;
  
  -- Criar lista de compras
  INSERT INTO listas_compras (user_id, titulo, origem, cardapio_id)
  VALUES (auth.uid(), 'Lista: ' || cardapio_titulo, 'cardapio', cardapio_uuid)
  RETURNING id INTO nova_lista_id;
  
  -- Inserir ingredientes consolidados de todas as receitas do cardápio
  FOR ingrediente_record IN
    SELECT 
      ri.produto_nome_busca,
      SUM(ri.quantidade::numeric) as quantidade_total,
      ri.unidade_medida
    FROM cardapio_receitas cr
    JOIN receita_ingredientes ri ON ri.receita_id = cr.receita_id
    WHERE cr.cardapio_id = cardapio_uuid
    AND NOT EXISTS (
      SELECT 1 FROM estoque_app e 
      WHERE e.user_id = auth.uid() 
      AND (
        UPPER(TRIM(e.produto_nome)) = UPPER(TRIM(ri.produto_nome_busca)) OR
        UPPER(TRIM(e.produto_nome)) LIKE '%' || UPPER(TRIM(ri.produto_nome_busca)) || '%' OR
        similarity(UPPER(e.produto_nome), UPPER(ri.produto_nome_busca)) > 0.6
      )
    )
    GROUP BY ri.produto_nome_busca, ri.unidade_medida
  LOOP
    INSERT INTO listas_compras_itens (
      lista_id,
      produto_nome,
      quantidade,
      unidade_medida
    ) VALUES (
      nova_lista_id,
      ingrediente_record.produto_nome_busca,
      ingrediente_record.quantidade_total,
      COALESCE(ingrediente_record.unidade_medida, 'un')
    );
  END LOOP;
  
  RETURN nova_lista_id;
END;
$$;