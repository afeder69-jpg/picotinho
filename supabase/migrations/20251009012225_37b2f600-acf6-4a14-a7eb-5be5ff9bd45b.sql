-- Adicionar 'brasileiras' ao enum fonte_receita
ALTER TYPE fonte_receita ADD VALUE IF NOT EXISTS 'brasileiras';

-- Criar função RPC para buscar receitas brasileiras com disponibilidade
CREATE OR REPLACE FUNCTION buscar_receitas_brasileiras_disponiveis()
RETURNS TABLE (
  receita_id uuid,
  titulo text,
  descricao text,
  categoria text,
  area text,
  imagem_url text,
  video_url text,
  porcoes text,
  tags text[],
  total_ingredientes bigint,
  ingredientes_disponiveis bigint,
  disponibilidade text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH receita_stats AS (
    SELECT 
      rpb.id as receita_id,
      rpb.titulo,
      rpb.descricao,
      rpb.categoria,
      rpb.area,
      rpb.imagem_url,
      rpb.video_url,
      rpb.porcoes,
      rpb.tags,
      COUNT(DISTINCT ri.produto_nome_busca) as total_ingredientes,
      COUNT(DISTINCT CASE 
        WHEN e.id IS NOT NULL THEN ri.produto_nome_busca 
      END) as ingredientes_disponiveis
    FROM receitas_publicas_brasileiras rpb
    LEFT JOIN LATERAL jsonb_array_elements(rpb.ingredientes) AS ing(value) ON true
    LEFT JOIN LATERAL (
      SELECT 
        COALESCE(
          ing.value->>'produto_nome_busca',
          ing.value->>'nome',
          ing.value->>'ingrediente'
        ) as produto_nome_busca
    ) ri ON ri.produto_nome_busca IS NOT NULL
    LEFT JOIN estoque_app e ON (
      e.user_id = auth.uid() AND (
        UPPER(TRIM(e.produto_nome)) = UPPER(TRIM(ri.produto_nome_busca)) OR
        UPPER(TRIM(e.produto_nome)) LIKE '%' || UPPER(TRIM(ri.produto_nome_busca)) || '%' OR
        UPPER(TRIM(ri.produto_nome_busca)) LIKE '%' || UPPER(TRIM(e.produto_nome)) || '%' OR
        similarity(UPPER(e.produto_nome), UPPER(ri.produto_nome_busca)) > 0.6
      )
    )
    GROUP BY rpb.id, rpb.titulo, rpb.descricao, rpb.categoria, rpb.area, 
             rpb.imagem_url, rpb.video_url, rpb.porcoes, rpb.tags
  )
  SELECT 
    rs.receita_id,
    rs.titulo,
    rs.descricao,
    rs.categoria,
    rs.area,
    rs.imagem_url,
    rs.video_url,
    rs.porcoes,
    rs.tags,
    rs.total_ingredientes,
    rs.ingredientes_disponiveis,
    CASE 
      WHEN rs.total_ingredientes = 0 THEN 'parcial'
      WHEN rs.ingredientes_disponiveis >= rs.total_ingredientes THEN 'completo'
      WHEN rs.ingredientes_disponiveis > 0 THEN 'parcial'
      ELSE 'indisponivel'
    END::text as disponibilidade
  FROM receita_stats rs
  ORDER BY rs.titulo;
END;
$$;